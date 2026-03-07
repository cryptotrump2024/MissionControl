"""
Built-in Sandboxed Tools — Available to all agents in Phase 1.

These tools are sandboxed: they can research, analyze, and draft,
but do NOT execute external actions (no emails, no posts, no external API calls).
"""

import json
import logging
from typing import Any, TYPE_CHECKING

from agents.sdk.tools import tool

if TYPE_CHECKING:
    from agents.sdk.mc_client import MCClient

logger = logging.getLogger(__name__)

# Module-level MC client ref, set by BaseAgent on startup
_mc_client: "MCClient | None" = None


def set_mc_client(client: "MCClient") -> None:
    global _mc_client
    _mc_client = client


# ── Research Tools ───────────────────────────────────────────────────

@tool(
    name="web_search",
    description="Search the web for information. Returns a summary of search results. Use this to gather current information, research topics, or verify facts.",
)
async def web_search(query: str, max_results: int = 5) -> str:
    """
    Simulated web search for Phase 1 (sandboxed).
    In Phase 2, this will integrate with a real search API (SerpAPI, Tavily, etc.)
    """
    # Phase 1: Return a placeholder indicating what would be searched
    return (
        f"[Web Search Results for: '{query}']\n\n"
        f"Note: Web search is in sandbox mode. In production, this would return "
        f"real search results from the web.\n\n"
        f"To implement real search, integrate with:\n"
        f"- Tavily API (recommended for AI agents)\n"
        f"- SerpAPI\n"
        f"- Brave Search API\n\n"
        f"Requested {max_results} results for query: {query}"
    )


@tool(
    name="read_file",
    description="Read the contents of a file from the workspace. Use this to review existing documents, code files, or data files.",
)
async def read_file(file_path: str) -> str:
    """Read a file from the workspace directory."""
    try:
        from pathlib import Path
        path = Path(file_path)

        # Security: prevent directory traversal
        if ".." in str(path):
            return "Error: Directory traversal not allowed."

        if not path.exists():
            return f"Error: File '{file_path}' not found."

        content = path.read_text(encoding="utf-8")
        if len(content) > 10000:
            content = content[:10000] + f"\n\n... [truncated, total length: {len(content)} chars]"

        return content

    except Exception as e:
        return f"Error reading file: {str(e)}"


@tool(
    name="write_draft",
    description="Write a draft document to the workspace. The content is saved as a draft for review, not published or sent. Use this for creating blog posts, reports, documentation, etc.",
)
async def write_draft(filename: str, content: str, file_type: str = "md") -> str:
    """Write a draft file to the workspace drafts directory."""
    try:
        from pathlib import Path
        drafts_dir = Path("workspace/drafts")
        drafts_dir.mkdir(parents=True, exist_ok=True)

        # Sanitize filename
        safe_name = "".join(c for c in filename if c.isalnum() or c in "._- ").strip()
        if not safe_name:
            safe_name = "draft"
        if not safe_name.endswith(f".{file_type}"):
            safe_name += f".{file_type}"

        file_path = drafts_dir / safe_name
        file_path.write_text(content, encoding="utf-8")

        return f"Draft saved to: {file_path}\nLength: {len(content)} characters"

    except Exception as e:
        return f"Error writing draft: {str(e)}"


@tool(
    name="write_code",
    description="Write code to a file in the workspace. The code is saved for review, not executed automatically. Use this for creating scripts, modules, or configuration files.",
)
async def write_code(filename: str, code: str, language: str = "python") -> str:
    """Write code to the workspace code directory."""
    try:
        from pathlib import Path
        code_dir = Path("workspace/code")
        code_dir.mkdir(parents=True, exist_ok=True)

        safe_name = "".join(c for c in filename if c.isalnum() or c in "._- ").strip()
        if not safe_name:
            safe_name = f"code.{language[:3]}"

        file_path = code_dir / safe_name
        file_path.write_text(code, encoding="utf-8")

        return f"Code saved to: {file_path}\nLanguage: {language}\nLines: {code.count(chr(10)) + 1}"

    except Exception as e:
        return f"Error writing code: {str(e)}"


# ── Analysis Tools ───────────────────────────────────────────────────

@tool(
    name="analyze_data",
    description="Analyze structured data (JSON, CSV-like text). Returns statistical summaries, patterns, and insights. Provide the data as a string.",
)
async def analyze_data(data: str, analysis_type: str = "summary") -> str:
    """Analyze data and return insights."""
    try:
        # Try to parse as JSON
        parsed = json.loads(data)

        if isinstance(parsed, list):
            return (
                f"Dataset Analysis:\n"
                f"- Type: Array/List\n"
                f"- Records: {len(parsed)}\n"
                f"- Sample (first item): {json.dumps(parsed[0], indent=2) if parsed else 'empty'}\n"
                f"- Analysis type: {analysis_type}"
            )
        elif isinstance(parsed, dict):
            return (
                f"Dataset Analysis:\n"
                f"- Type: Object/Dict\n"
                f"- Keys: {list(parsed.keys())}\n"
                f"- Analysis type: {analysis_type}"
            )
        else:
            return f"Data value: {parsed} (type: {type(parsed).__name__})"

    except json.JSONDecodeError:
        lines = data.strip().split("\n")
        return (
            f"Text Data Analysis:\n"
            f"- Lines: {len(lines)}\n"
            f"- Characters: {len(data)}\n"
            f"- Words: {len(data.split())}\n"
            f"- Analysis type: {analysis_type}"
        )


@tool(
    name="summarize",
    description="Summarize a long piece of text into key points. Useful for condensing research results, reports, or documents.",
)
async def summarize(text: str, max_points: int = 5) -> str:
    """Produce a structured summary of the text."""
    word_count = len(text.split())
    sentences = [s.strip() for s in text.replace("\n", " ").split(".") if s.strip()]

    summary_lines = [f"Summary ({word_count} words, {len(sentences)} sentences):"]
    # Take evenly spaced sentences as key points
    if sentences:
        step = max(1, len(sentences) // max_points)
        for i, idx in enumerate(range(0, len(sentences), step)):
            if i >= max_points:
                break
            summary_lines.append(f"  {i + 1}. {sentences[idx]}.")

    return "\n".join(summary_lines)


# ── Delegation Tools ─────────────────────────────────────────────────

@tool(
    name="delegate_task",
    description="Delegate a subtask to another agent. Specify the target agent type (researcher, writer, developer, auditor) and the task details. Only delegate to agents in your delegation_targets list.",
)
async def delegate_task(
    target_agent: str,
    task_title: str,
    task_description: str,
    priority: int = 5,
) -> str:
    """Actually creates a subtask via MissionControl API and pushes to Redis stream."""
    if _mc_client is None:
        return json.dumps({"error": "MCClient not initialized - delegation unavailable"})

    try:
        task = await _mc_client.create_task({
            "title": task_title,
            "description": task_description,
            "delegated_to": target_agent,
            "priority": priority,
        })
        task_id = task.get("id", "unknown")
        return json.dumps({
            "success": True,
            "task_id": task_id,
            "target_agent": target_agent,
            "message": f"Task '{task_title}' delegated to {target_agent} (id={task_id})"
        })
    except Exception as e:
        return json.dumps({"error": f"Delegation failed: {str(e)}"})


@tool(
    name="plan_tasks",
    description="Break down a complex task into a structured plan of subtasks. Each subtask specifies which agent type should handle it. Returns a task decomposition plan.",
)
async def plan_tasks(
    main_task: str,
    subtasks: str,
) -> str:
    """
    Create a task decomposition plan.
    subtasks should be a JSON string array of {title, description, agent_type, priority}.
    """
    try:
        parsed = json.loads(subtasks)
        plan_lines = [f"Task Decomposition Plan for: {main_task}\n"]
        for i, task in enumerate(parsed, 1):
            plan_lines.append(
                f"  {i}. [{task.get('agent_type', 'unassigned')}] "
                f"{task.get('title', 'Untitled')} (priority: {task.get('priority', 5)})\n"
                f"     {task.get('description', '')}"
            )
        return "\n".join(plan_lines)
    except json.JSONDecodeError:
        return f"Task Plan:\n{subtasks}"


# ── Review Tools ─────────────────────────────────────────────────────

@tool(
    name="review_output",
    description="Review and evaluate an output from another agent or task. Assess quality, accuracy, completeness, and provide feedback.",
)
async def review_output(
    content: str,
    criteria: str = "quality,accuracy,completeness",
) -> str:
    """Review content against criteria."""
    criteria_list = [c.strip() for c in criteria.split(",")]
    review_lines = ["Output Review:"]
    review_lines.append(f"- Content length: {len(content)} characters")
    review_lines.append(f"- Word count: {len(content.split())} words")
    review_lines.append(f"- Evaluation criteria: {', '.join(criteria_list)}")
    review_lines.append(f"- Content preview: {content[:200]}...")
    review_lines.append("\nPlease provide your detailed assessment based on the criteria above.")
    return "\n".join(review_lines)


@tool(
    name="flag_issue",
    description="Flag an issue found during review. Used by the Auditor agent to report quality, accuracy, or compliance problems.",
)
async def flag_issue(
    issue_type: str,
    severity: str,
    description: str,
    affected_content: str = "",
) -> str:
    """Flag an issue for human review."""
    return json.dumps({
        "_issue_flag": True,
        "type": issue_type,
        "severity": severity,
        "description": description,
        "affected_content": affected_content[:500],
    })
