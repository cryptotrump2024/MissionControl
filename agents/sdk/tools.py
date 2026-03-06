"""
Tool Registry — Defines, registers, and executes tools that agents can use.

Tools are Python functions decorated with @tool that get converted into
Claude tool_use format schemas. Each agent has a whitelist of allowed tools.
"""

import logging
import inspect
import json
from typing import Any, Callable
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Global tool storage
_registered_tools: dict[str, "ToolDefinition"] = {}


@dataclass
class ToolDefinition:
    """A registered tool with its callable and schema."""
    name: str
    description: str
    function: Callable
    parameters: dict  # JSON Schema for input parameters
    is_sandboxed: bool = True  # Phase 1: all tools are sandboxed

    def to_claude_schema(self) -> dict:
        """Convert to Claude tool_use format."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.parameters,
        }


@dataclass
class ToolResult:
    """Result of a tool execution."""
    tool_use_id: str
    output: str
    is_error: bool = False

    def to_message(self) -> dict:
        """Convert to Claude message format for tool results."""
        return {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": self.tool_use_id,
                    "content": self.output,
                    "is_error": self.is_error,
                }
            ],
        }


def tool(
    name: str | None = None,
    description: str = "",
    sandboxed: bool = True,
):
    """
    Decorator to register a function as an agent tool.

    Usage:
        @tool(name="web_search", description="Search the web for information")
        async def web_search(query: str, max_results: int = 5) -> str:
            ...
    """
    def decorator(func: Callable) -> Callable:
        tool_name = name or func.__name__

        # Auto-generate JSON schema from function signature
        sig = inspect.signature(func)
        properties = {}
        required = []

        for param_name, param in sig.parameters.items():
            if param_name == "self":
                continue

            param_type = param.annotation
            json_type = _python_type_to_json(param_type)
            properties[param_name] = {"type": json_type}

            if param.default == inspect.Parameter.empty:
                required.append(param_name)
            else:
                properties[param_name]["default"] = param.default

        parameters = {
            "type": "object",
            "properties": properties,
            "required": required,
        }

        tool_def = ToolDefinition(
            name=tool_name,
            description=description or func.__doc__ or "",
            function=func,
            parameters=parameters,
            is_sandboxed=sandboxed,
        )

        _registered_tools[tool_name] = tool_def
        func._tool_definition = tool_def
        return func

    return decorator


def _python_type_to_json(python_type) -> str:
    """Convert Python type annotation to JSON Schema type."""
    type_map = {
        str: "string",
        int: "integer",
        float: "number",
        bool: "boolean",
        list: "array",
        dict: "object",
    }
    return type_map.get(python_type, "string")


class ToolRegistry:
    """
    Manages the set of tools available to a specific agent.
    Filters from the global registry based on the agent's allowed_tools list.
    """

    def __init__(self, allowed_tools: list[str] | None = None):
        self.allowed_tools = allowed_tools
        self._tools: dict[str, ToolDefinition] = {}
        self._load_tools()

    def _load_tools(self):
        """Load tools from global registry, filtered by allowed list."""
        for name, tool_def in _registered_tools.items():
            if self.allowed_tools is None or name in self.allowed_tools:
                self._tools[name] = tool_def

    def register(self, tool_def: ToolDefinition):
        """Register a tool directly (for agent-specific tools)."""
        self._tools[tool_def.name] = tool_def

    def register_function(
        self,
        func: Callable,
        name: str | None = None,
        description: str = "",
    ):
        """Register a plain function as a tool."""
        tool_decorator = tool(name=name, description=description)
        decorated = tool_decorator(func)
        self._tools[decorated._tool_definition.name] = decorated._tool_definition

    @property
    def schemas(self) -> list[dict]:
        """Get Claude-format tool schemas for all registered tools."""
        return [t.to_claude_schema() for t in self._tools.values()]

    @property
    def tool_names(self) -> list[str]:
        return list(self._tools.keys())

    async def execute(self, tool_call: dict) -> ToolResult:
        """
        Execute a tool call from Claude's response.

        Args:
            tool_call: Dict with 'id', 'name', 'input' from Claude response

        Returns:
            ToolResult with output or error
        """
        tool_name = tool_call["name"]
        tool_id = tool_call["id"]
        tool_input = tool_call.get("input", {})

        if tool_name not in self._tools:
            return ToolResult(
                tool_use_id=tool_id,
                output=f"Error: Tool '{tool_name}' not found. Available tools: {self.tool_names}",
                is_error=True,
            )

        tool_def = self._tools[tool_name]

        try:
            logger.info(f"Executing tool: {tool_name} with input: {json.dumps(tool_input)[:200]}")

            if inspect.iscoroutinefunction(tool_def.function):
                result = await tool_def.function(**tool_input)
            else:
                result = tool_def.function(**tool_input)

            output = str(result) if not isinstance(result, str) else result
            logger.info(f"Tool {tool_name} completed. Output length: {len(output)}")

            return ToolResult(
                tool_use_id=tool_id,
                output=output,
            )

        except Exception as e:
            logger.error(f"Tool {tool_name} failed: {e}")
            return ToolResult(
                tool_use_id=tool_id,
                output=f"Error executing {tool_name}: {str(e)}",
                is_error=True,
            )
