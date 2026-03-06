import { useState, useMemo, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Separator,
} from "@/components/ui";
import {
  Shield,
  Eye,
  Crown,
  Settings,
  Cpu,
  DollarSign,
  Megaphone,
  Users,
  Target,
  Search,
  ChevronDown,
  ChevronUp,
  BarChart3,
  FileText,
  Globe,
  Code,
  Lock,
  Database,
  HeartHandshake,
  Package,
  Layers,
  Server,
  BookOpen,
  Share2,
  Mail,
  Palette,
  Handshake,
  Newspaper,
  Scale,
  Radar,
  Lightbulb,
  Zap,
  GraduationCap,
  ArrowRight,
  CheckCircle,
  Clock,
  AlertTriangle,
  Sparkles,
  Building2,
  Network,
  TrendingUp,
  CircleDot,
  Boxes,
} from "lucide-react";

const tierConfig = {
  0: { label: "Governance", color: "#DC2626", bg: "bg-red-950/40", border: "border-red-800/50", badgeBg: "bg-red-900/60 text-red-200 border-red-700/50", icon: Shield },
  1: { label: "Executive", color: "#D97706", bg: "bg-amber-950/40", border: "border-amber-800/50", badgeBg: "bg-amber-900/60 text-amber-200 border-amber-700/50", icon: Crown },
  2: { label: "Management", color: "#2563EB", bg: "bg-blue-950/40", border: "border-blue-800/50", badgeBg: "bg-blue-900/60 text-blue-200 border-blue-700/50", icon: Settings },
  3: { label: "Operational", color: "#16A34A", bg: "bg-green-950/40", border: "border-green-800/50", badgeBg: "bg-green-900/60 text-green-200 border-green-700/50", icon: Zap },
};

const agents = [
  { id: "ethics", tier: 0, title: "AI Ethics & Governance Agent", icon: Shield, description: "Ensures all AI operations adhere to ethical standards, detects bias, audits fairness, monitors model drift, and enforces explainability across the organization.", skills: ["Bias Detection", "Fairness Auditing", "Responsible AI", "Model Drift Monitoring", "Explainability", "AI Policy"], juniors: [], reportsTo: "Board / External Oversight", collaborates: ["Internal Audit Agent", "CEO Agent", "Cybersecurity Agent"] },
  { id: "audit", tier: 0, title: "Internal Audit Agent", icon: Eye, description: "Conducts process compliance reviews, financial audit trails, risk scoring, and anomaly detection across all departments to ensure organizational integrity.", skills: ["Process Compliance", "Financial Auditing", "Risk Scoring", "Anomaly Detection", "SOX Compliance", "Control Testing"], juniors: [], reportsTo: "Board / External Oversight", collaborates: ["AI Ethics Agent", "CFO Agent", "Legal & Compliance Agent"] },

  { id: "ceo", tier: 1, title: "CEO Agent", icon: Crown, description: "Master orchestrator and strategic visionary. Resolves cross-departmental conflicts, manages stakeholder communication, owns KPIs, and drives long-horizon planning with quarterly and annual strategy cycles.", skills: ["Strategic Vision", "Cross-Dept Orchestration", "KPI Ownership", "Decision Under Uncertainty", "Stakeholder Comms", "Conflict Resolution"], juniors: ["Executive Assistant Agent"], reportsTo: "Governance Layer", collaborates: ["All C-Suite Agents", "CSO Agent"] },
  { id: "coo", tier: 1, title: "COO Agent", icon: Settings, description: "Manages day-to-day operations, optimizes workflows, detects bottlenecks, allocates resources, enforces SOPs, and tracks OKRs and SLAs across the organization.", skills: ["Workflow Optimization", "Bottleneck Detection", "Resource Allocation", "SOP Enforcement", "OKR Tracking", "SLA Management"], juniors: ["Operations Coordinator Agent"], reportsTo: "CEO Agent", collaborates: ["CTO Agent", "RevOps Manager", "IT Ops Agent"] },
  { id: "cto", tier: 1, title: "CTO Agent", icon: Cpu, description: "Oversees technical architecture, toolstack decisions, AI/ML pipeline management, security posture, scalability planning, vendor evaluation, and technical debt management.", skills: ["Tech Architecture", "AI/ML Pipelines", "Security Posture", "Scalability", "Vendor Evaluation", "Technical Debt"], juniors: ["Tech Research Assistant Agent"], reportsTo: "CEO Agent", collaborates: ["Lead Developer", "Cybersecurity Agent", "IT Ops Agent"] },
  { id: "cfo", tier: 1, title: "CFO Agent", icon: DollarSign, description: "Drives financial modeling, budgeting, forecasting, P&L management, cash flow optimization, ROI analysis, cost optimization, and tax/compliance flagging.", skills: ["Financial Modeling", "Budgeting", "Forecasting", "P&L Analysis", "Cash Flow", "ROI Analysis", "Tax Compliance"], juniors: ["Finance Assistant Agent"], reportsTo: "CEO Agent", collaborates: ["RevOps Manager", "Internal Audit Agent", "COO Agent"] },
  { id: "cmo", tier: 1, title: "CMO Agent", icon: Megaphone, description: "Leads brand strategy, demand generation, content strategy, market research, audience segmentation, and performance marketing with focus on CAC, LTV, and ROAS.", skills: ["Brand Strategy", "Demand Gen", "Content Strategy", "Market Research", "Audience Segmentation", "Performance Marketing"], juniors: ["Marketing Coordinator Agent"], reportsTo: "CEO Agent", collaborates: ["Sales Manager", "Content & SEO Manager", "CSO Agent"] },
  { id: "chro", tier: 1, title: "CHRO Agent", icon: Users, description: "Shapes talent strategy, culture architecture, workforce planning, DEI initiatives, employer branding, and compensation benchmarking for the organization.", skills: ["Talent Strategy", "Culture Architecture", "Workforce Planning", "DEI Initiatives", "Employer Branding", "Compensation Benchmarking"], juniors: ["HR Coordinator Agent"], reportsTo: "CEO Agent", collaborates: ["Training Agent", "Knowledge Mgmt Agent", "COO Agent"] },
  { id: "cso", tier: 1, title: "CSO Agent", icon: Target, description: "Provides market intelligence, competitive landscape analysis, M&A evaluation, strategic partnership assessment, business model innovation, and scenario planning.", skills: ["Market Intelligence", "Competitive Landscape", "M&A Analysis", "Strategic Partnerships", "Business Model Innovation", "Scenario Planning"], juniors: ["Strategy Research Agent"], reportsTo: "CEO Agent", collaborates: ["CEO Agent", "CMO Agent", "Competitive Intel Agent"] },

  { id: "sales", tier: 2, title: "Sales Manager Agent", icon: TrendingUp, description: "Manages CRM operations, sales pipeline, lead scoring using BANT/MEDDIC frameworks, forecasting, deal coaching, and battlecard creation.", skills: ["CRM Management", "Pipeline Management", "BANT/MEDDIC", "Forecasting", "Deal Coaching", "Battlecards"], juniors: ["SDR Agent"], reportsTo: "CMO Agent", collaborates: ["RevOps Manager", "Content & SEO Manager", "Customer Success"] },
  { id: "content-seo", tier: 2, title: "Content & SEO Manager Agent", icon: FileText, description: "Manages keyword research, topic clusters, technical SEO, content briefs, backlink strategy, and Core Web Vitals optimization.", skills: ["Keyword Research", "Topic Clusters", "Technical SEO", "Content Briefs", "Backlink Strategy", "Core Web Vitals"], juniors: ["Content Writer Agent"], reportsTo: "CMO Agent", collaborates: ["GEO Specialist", "Social Media Agent", "Creative Agent"] },
  { id: "geo", tier: 2, title: "GEO Specialist Agent", icon: Globe, description: "Specializes in structured data, AI summarization formatting, citation building, E-E-A-T optimization, AI Overview targeting, and prompt-pattern matching.", skills: ["Structured Data", "AI Summarization", "Citation Building", "E-E-A-T", "AI Overview Targeting", "Prompt-Pattern Matching"], juniors: ["GEO Research Assistant Agent"], reportsTo: "CMO Agent", collaborates: ["Content & SEO Manager", "Data & BI Manager"] },
  { id: "lead-dev", tier: 2, title: "Lead Developer Agent", icon: Code, description: "Leads full-stack development, code reviews, CI/CD pipelines, API design, Agile/Scrum ceremonies, and bug triage across engineering teams.", skills: ["Full-Stack Dev", "Code Review", "CI/CD", "API Design", "Agile/Scrum", "Bug Triage"], juniors: ["Frontend Dev Agent", "Backend Dev Agent", "QA/Testing Agent"], reportsTo: "CTO Agent", collaborates: ["Cybersecurity Agent", "IT Ops Agent", "Product Manager"] },
  { id: "cybersecurity", tier: 2, title: "Cybersecurity & Compliance Agent", icon: Lock, description: "Handles threat detection, vulnerability scanning, OWASP compliance, GDPR/CCPA/HIPAA adherence, access control, and AI-specific security including prompt injection and data poisoning defense.", skills: ["Threat Detection", "Vulnerability Scanning", "OWASP", "GDPR/CCPA/HIPAA", "Access Control", "Prompt Injection Defense"], juniors: ["Security Monitoring Agent"], reportsTo: "CTO Agent", collaborates: ["AI Ethics Agent", "IT Ops Agent", "Internal Audit Agent"] },
  { id: "data-bi", tier: 2, title: "Data & BI Manager Agent", icon: Database, description: "Manages data pipelines, ETL processes, dashboards, predictive analytics, A/B testing frameworks, and data quality assurance.", skills: ["Data Pipelines", "ETL", "Dashboards", "Predictive Analytics", "A/B Testing", "Data Quality"], juniors: ["Data Analyst Agent"], reportsTo: "CTO Agent", collaborates: ["RevOps Manager", "Product Manager", "GEO Specialist"] },
  { id: "customer-success", tier: 2, title: "Customer Success Manager Agent", icon: HeartHandshake, description: "Drives customer health scoring, churn prediction, onboarding flows, NPS/CSAT tracking, and upsell/cross-sell identification.", skills: ["Health Scoring", "Churn Prediction", "Onboarding", "NPS/CSAT", "Upsell/Cross-sell", "Account Management"], juniors: ["Support Agent", "Onboarding Agent"], reportsTo: "COO Agent", collaborates: ["Sales Manager", "Product Manager", "Training Agent"] },
  { id: "product", tier: 2, title: "Product Manager Agent", icon: Package, description: "Owns product roadmap, feature prioritization using RICE/MoSCoW, user stories, backlog management, and release notes.", skills: ["Roadmap Planning", "RICE/MoSCoW", "User Stories", "Backlog Management", "Release Notes", "Stakeholder Alignment"], juniors: ["Product Analyst Agent"], reportsTo: "CTO Agent", collaborates: ["Lead Developer", "Customer Success", "Data & BI Manager"] },
  { id: "revops", tier: 2, title: "RevOps Manager Agent", icon: BarChart3, description: "Optimizes the revenue lifecycle, funnel analytics, sales-marketing alignment, attribution modeling, and tech stack integration.", skills: ["Revenue Lifecycle", "Funnel Analytics", "Sales-Marketing Alignment", "Attribution Modeling", "Tech Stack Integration"], juniors: ["RevOps Analyst Agent"], reportsTo: "CFO Agent", collaborates: ["Sales Manager", "CMO Agent", "Data & BI Manager"] },
  { id: "supply-chain", tier: 2, title: "Supply Chain & Procurement Agent", icon: Boxes, description: "Manages vendor relationships, procurement optimization, inventory forecasting, contract negotiation support, and logistics coordination.", skills: ["Vendor Management", "Procurement", "Inventory Forecasting", "Contract Negotiation", "Logistics", "Cost Optimization"], juniors: ["Procurement Assistant Agent"], reportsTo: "COO Agent", collaborates: ["CFO Agent", "IT Ops Agent", "Legal Agent"] },
  { id: "it-ops", tier: 2, title: "IT Operations & Infrastructure Agent", icon: Server, description: "Monitors system uptime, manages cloud resources, handles incident management, disaster recovery planning, and capacity planning.", skills: ["Uptime Monitoring", "Cloud Management", "Incident Management", "Disaster Recovery", "Capacity Planning", "Infrastructure as Code"], juniors: ["IT Support Agent"], reportsTo: "CTO Agent", collaborates: ["Cybersecurity Agent", "Lead Developer", "COO Agent"] },
  { id: "knowledge", tier: 2, title: "Knowledge Management Agent", icon: BookOpen, description: "Captures institutional knowledge, maintains documentation standards, manages internal wikis, facilitates cross-team knowledge sharing, and creates onboarding knowledge paths.", skills: ["Knowledge Capture", "Documentation Standards", "Wiki Management", "Cross-Team Sharing", "Onboarding Paths", "Taxonomy Design"], juniors: ["Documentation Agent"], reportsTo: "COO Agent", collaborates: ["CHRO Agent", "Training Agent", "All Departments"] },

  { id: "social-media", tier: 3, title: "Social Media Manager Agent", icon: Share2, description: "Executes social media strategy, content scheduling, community management, social listening, and engagement analytics.", skills: ["Social Strategy", "Content Scheduling", "Community Mgmt", "Social Listening", "Engagement Analytics"], juniors: [], reportsTo: "Content & SEO Manager", collaborates: ["Creative Agent", "PR Agent", "Email Marketing Agent"] },
  { id: "email-marketing", tier: 3, title: "Email Marketing Agent", icon: Mail, description: "Manages email campaigns, drip sequences, segmentation, deliverability, A/B testing, and conversion optimization.", skills: ["Campaign Management", "Drip Sequences", "Segmentation", "Deliverability", "A/B Testing"], juniors: [], reportsTo: "Content & SEO Manager", collaborates: ["Social Media Agent", "Sales Manager", "Automation Agent"] },
  { id: "creative", tier: 3, title: "Creative & Brand Design Agent", icon: Palette, description: "Creates visual assets, brand guidelines, UI/UX mockups, presentation design, and maintains brand consistency.", skills: ["Visual Design", "Brand Guidelines", "UI/UX Mockups", "Presentation Design", "Brand Consistency"], juniors: [], reportsTo: "CMO Agent", collaborates: ["Content & SEO Manager", "Social Media Agent", "Product Manager"] },
  { id: "partnerships", tier: 3, title: "Partnerships & BD Agent", icon: Handshake, description: "Identifies partnership opportunities, manages co-marketing, channel partnerships, affiliate programs, and strategic alliances.", skills: ["Partner Sourcing", "Co-Marketing", "Channel Partnerships", "Affiliate Programs", "Strategic Alliances"], juniors: [], reportsTo: "CSO Agent", collaborates: ["Sales Manager", "CMO Agent", "Legal Agent"] },
  { id: "pr", tier: 3, title: "PR & Communications Agent", icon: Newspaper, description: "Manages press releases, media relations, crisis communications, thought leadership, and public narratives.", skills: ["Press Releases", "Media Relations", "Crisis Comms", "Thought Leadership", "Public Narrative"], juniors: [], reportsTo: "CMO Agent", collaborates: ["Social Media Agent", "Creative Agent", "CEO Agent"] },
  { id: "legal", tier: 3, title: "Legal & Compliance Agent", icon: Scale, description: "Flags legal risks, reviews contracts, monitors regulatory changes, and escalates to human legal counsel. Does not provide legal advice.", skills: ["Risk Flagging", "Contract Review", "Regulatory Monitoring", "Compliance Tracking", "Escalation Protocols"], juniors: [], reportsTo: "Internal Audit Agent", collaborates: ["Cybersecurity Agent", "CFO Agent", "Supply Chain Agent"] },
  { id: "competitive-intel", tier: 3, title: "Competitive Intelligence Agent", icon: Radar, description: "Monitors competitor activities, pricing changes, product launches, market positioning, and generates competitive battlecards.", skills: ["Competitor Monitoring", "Pricing Analysis", "Product Intel", "Market Positioning", "Battlecard Creation"], juniors: [], reportsTo: "CSO Agent", collaborates: ["Sales Manager", "Product Manager", "CMO Agent"] },
  { id: "customer-research", tier: 3, title: "Customer Research & Insights Agent", icon: Lightbulb, description: "Conducts user research, survey design, sentiment analysis, persona development, and journey mapping.", skills: ["User Research", "Survey Design", "Sentiment Analysis", "Persona Development", "Journey Mapping"], juniors: [], reportsTo: "Product Manager", collaborates: ["Customer Success", "Data & BI Manager", "UX/Creative Agent"] },
  { id: "automation", tier: 3, title: "Automation & Integration Agent", icon: Zap, description: "Builds Zapier/Make workflows, API integrations, no-code automation, process automation, and cross-tool data synchronization.", skills: ["Zapier/Make", "API Integrations", "No-Code Automation", "Process Automation", "Data Sync"], juniors: [], reportsTo: "IT Ops Agent", collaborates: ["Lead Developer", "RevOps Manager", "Data & BI Manager"] },
  { id: "training", tier: 3, title: "Training & Enablement Agent", icon: GraduationCap, description: "Creates internal training content, conducts skill gap analysis, designs learning paths, manages LMS, and drives enablement programs.", skills: ["Training Content", "Skill Gap Analysis", "Learning Paths", "LMS Management", "Enablement Programs"], juniors: [], reportsTo: "CHRO Agent", collaborates: ["Knowledge Mgmt Agent", "Customer Success", "All Departments"] },
];

const priorityMatrix = [
  { category: "Customer-Facing Revenue", agents: "Sales, Customer Success, RevOps", priority: "Critical", phase: "Phase 1", color: "bg-red-900/60 text-red-200" },
  { category: "Content & Visibility", agents: "Content/SEO, GEO, Social Media", priority: "Critical", phase: "Phase 1", color: "bg-red-900/60 text-red-200" },
  { category: "Technical Foundation", agents: "Lead Dev, CTO, IT Ops", priority: "Critical", phase: "Phase 1", color: "bg-red-900/60 text-red-200" },
  { category: "Governance & Ethics", agents: "Ethics, Audit, Legal", priority: "High", phase: "Phase 1", color: "bg-amber-900/60 text-amber-200" },
  { category: "Data & Intelligence", agents: "Data/BI, Competitive Intel, Research", priority: "High", phase: "Phase 2", color: "bg-amber-900/60 text-amber-200" },
  { category: "Marketing Execution", agents: "Email, Creative, PR", priority: "Medium", phase: "Phase 2", color: "bg-blue-900/60 text-blue-200" },
  { category: "Operational Excellence", agents: "Supply Chain, Knowledge Mgmt", priority: "Medium", phase: "Phase 3", color: "bg-blue-900/60 text-blue-200" },
  { category: "People & Culture", agents: "CHRO, Training, Enablement", priority: "Medium", phase: "Phase 3", color: "bg-blue-900/60 text-blue-200" },
  { category: "Strategic Growth", agents: "CSO, Partnerships, BD", priority: "Standard", phase: "Phase 4", color: "bg-green-900/60 text-green-200" },
  { category: "Automation & Scale", agents: "Automation, Integration", priority: "Standard", phase: "Phase 4", color: "bg-green-900/60 text-green-200" },
];

const roadmapPhases = [
  { phase: "Phase 1", title: "Foundation & Core Revenue", duration: "Weeks 1–4", icon: Building2, items: ["Deploy Governance agents (Ethics & Audit) as guardrails", "Activate CEO, CTO, CFO, COO for strategic orchestration", "Launch Sales Manager, Customer Success, and RevOps for revenue pipeline", "Set up Lead Developer and IT Ops for technical infrastructure", "Establish Content/SEO and GEO agents for organic visibility"] },
  { phase: "Phase 2", title: "Intelligence & Marketing", duration: "Weeks 5–8", icon: BarChart3, items: ["Deploy Data & BI Manager for analytics infrastructure", "Activate CMO and marketing execution agents (Email, Social, Creative)", "Launch Competitive Intelligence and Customer Research agents", "Enable Cybersecurity & Compliance for security hardening", "Integrate Product Manager for roadmap orchestration"] },
  { phase: "Phase 3", title: "Operations & People", duration: "Weeks 9–12", icon: Users, items: ["Deploy CHRO and Training & Enablement agents", "Activate Supply Chain & Procurement optimization", "Launch Knowledge Management for institutional memory", "Enable PR & Communications for external narrative", "Set up cross-departmental collaboration workflows"] },
  { phase: "Phase 4", title: "Scale & Optimize", duration: "Weeks 13–16", icon: Sparkles, items: ["Deploy CSO for strategic growth initiatives", "Activate Partnerships & BD for ecosystem expansion", "Launch Automation & Integration for workflow optimization", "Enable full inter-agent communication mesh", "Continuous optimization, feedback loops, and model refinement"] },
];

function AgentCard({ agent }) {
  const [expanded, setExpanded] = useState(false);
  const tier = tierConfig[agent.tier];
  const IconComponent = agent.icon;

  return (
    <Card
      className={`group cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-black/20 ${tier.bg} ${tier.border} border backdrop-blur-sm`}
      onClick={() => setExpanded(!expanded)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="flex-shrink-0 rounded-lg p-2.5 transition-transform duration-300 group-hover:scale-110"
              style={{ backgroundColor: `${tier.color}20`, border: `1px solid ${tier.color}40` }}
            >
              <IconComponent size={22} style={{ color: tier.color }} />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold text-slate-100 leading-tight">
                {agent.title}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge variant="outline" className={`text-xs ${tier.badgeBg} border`}>
                  Tier {agent.tier} — {tier.label}
                </Badge>
                {agent.juniors.length > 0 && (
                  <Badge variant="outline" className="text-xs bg-slate-800/60 text-slate-300 border-slate-600/50">
                    {agent.juniors.length} Junior{agent.juniors.length > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 text-slate-500 transition-transform duration-200" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
            <ChevronDown size={18} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-400 leading-relaxed">{agent.description}</p>

        <div
          className="overflow-hidden transition-all duration-300"
          style={{ maxHeight: expanded ? "600px" : "0px", opacity: expanded ? 1 : 0, marginTop: expanded ? "16px" : "0px" }}
        >
          <Separator className="mb-4 bg-slate-700/50" />

          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Skills & Capabilities</p>
              <div className="flex flex-wrap gap-1.5">
                {agent.skills.map((skill, i) => (
                  <Badge key={i} variant="outline" className="text-xs bg-slate-800/80 text-slate-300 border-slate-600/50 hover:bg-slate-700/80 transition-colors">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>

            {agent.juniors.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Junior Assistants</p>
                <div className="flex flex-wrap gap-1.5">
                  {agent.juniors.map((junior, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-indigo-950/50 text-indigo-300 border-indigo-700/40">
                      {junior}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-900/50 p-3 border border-slate-700/30">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Reports To</p>
                <p className="text-sm text-slate-300">{agent.reportsTo}</p>
              </div>
              <div className="rounded-lg bg-slate-900/50 p-3 border border-slate-700/30">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Collaborates With</p>
                <p className="text-sm text-slate-300">{agent.collaborates.join(", ")}</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ArchitectureDiagram() {
  const layers = [
    { tier: 0, label: "Tier 0 — Governance Layer", desc: "Ethics, Audit & Oversight", count: 2, color: "#DC2626", bgClass: "bg-red-950/30 border-red-800/40" },
    { tier: 1, label: "Tier 1 — Executive Layer", desc: "C-Suite Strategic Agents", count: 7, color: "#D97706", bgClass: "bg-amber-950/30 border-amber-800/40" },
    { tier: 2, label: "Tier 2 — Management Layer", desc: "Department Heads & Managers", count: 12, color: "#2563EB", bgClass: "bg-blue-950/30 border-blue-800/40" },
    { tier: 3, label: "Tier 3 — Operational Layer", desc: "Specialists & Execution", count: 10, color: "#16A34A", bgClass: "bg-green-950/30 border-green-800/40" },
  ];

  return (
    <div className="space-y-3">
      {layers.map((layer, i) => (
        <div key={layer.tier}>
          <div className={`rounded-xl border p-4 sm:p-5 ${layer.bgClass} transition-all hover:scale-[1.01] duration-200`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: layer.color, boxShadow: `0 0 12px ${layer.color}60` }} />
                <div>
                  <p className="text-sm sm:text-base font-semibold text-slate-100">{layer.label}</p>
                  <p className="text-xs sm:text-sm text-slate-400">{layer.desc}</p>
                </div>
              </div>
              <Badge variant="outline" className="self-start sm:self-auto text-xs" style={{ backgroundColor: `${layer.color}20`, color: layer.color, borderColor: `${layer.color}50` }}>
                {layer.count} Agent{layer.count > 1 ? "s" : ""}
              </Badge>
            </div>
          </div>
          {i < layers.length - 1 && (
            <div className="flex justify-center py-1">
              <div className="flex flex-col items-center gap-0.5">
                <div className="w-px h-3 bg-gradient-to-b from-slate-600 to-slate-700" />
                <ChevronDown size={14} className="text-slate-600" />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function EnterpriseAIBlueprint() {
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSection, setExpandedSection] = useState({ architecture: true, priority: false, communication: false, roadmap: false });

  const toggleSection = useCallback((key) => {
    setExpandedSection((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const filteredAgents = useMemo(() => {
    let result = agents;
    if (activeTab !== "all") {
      result = result.filter((a) => a.tier === parseInt(activeTab));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.skills.some((s) => s.toLowerCase().includes(q))
      );
    }
    return result;
  }, [activeTab, searchQuery]);

  const tierCounts = useMemo(() => {
    const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    agents.forEach((a) => counts[a.tier]++);
    return counts;
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="relative overflow-hidden border-b border-slate-800/50">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-950/40 via-slate-950 to-purple-950/30" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 p-2.5">
              <Network size={28} className="text-white" />
            </div>
            <Badge variant="outline" className="bg-blue-950/50 text-blue-300 border-blue-700/50 text-xs">
              v2.0 — 4-Layer Architecture
            </Badge>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight bg-gradient-to-r from-slate-100 via-blue-200 to-purple-200 bg-clip-text text-transparent">
            Enterprise AI Agent
            <br />
            Organization Blueprint
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed">
            A comprehensive 4-layer organizational framework featuring 31 specialized AI agents with defined hierarchies, collaboration protocols, and implementation roadmap.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
            {[0, 1, 2, 3].map((tier) => {
              const cfg = tierConfig[tier];
              const TierIcon = cfg.icon;
              return (
                <div key={tier} className={`rounded-xl border p-3 sm:p-4 ${cfg.bg} ${cfg.border}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <TierIcon size={16} style={{ color: cfg.color }} />
                    <span className="text-xs font-medium text-slate-400">Tier {tier}</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold" style={{ color: cfg.color }}>{tierCounts[tier]}</p>
                  <p className="text-xs text-slate-500">{cfg.label} Agents</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <section>
          <button
            onClick={() => toggleSection("architecture")}
            className="w-full flex items-center justify-between py-3 text-left group"
          >
            <div className="flex items-center gap-3">
              <Layers size={20} className="text-blue-400" />
              <h2 className="text-xl sm:text-2xl font-bold text-slate-100">Architecture Overview</h2>
            </div>
            <ChevronDown
              size={20}
              className="text-slate-500 transition-transform duration-200"
              style={{ transform: expandedSection.architecture ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>
          <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: expandedSection.architecture ? "800px" : "0px", opacity: expandedSection.architecture ? 1 : 0 }}>
            <div className="pt-2 pb-4">
              <ArchitectureDiagram />
            </div>
          </div>
        </section>

        <Separator className="bg-slate-800/50" />

        <section>
          <div className="flex items-center gap-3 mb-4">
            <CircleDot size={20} className="text-purple-400" />
            <h2 className="text-xl sm:text-2xl font-bold text-slate-100">Agent Directory</h2>
            <Badge variant="outline" className="bg-slate-800/60 text-slate-300 border-slate-600/50 text-xs">
              {agents.length} Total
            </Badge>
          </div>

          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search agents by name, description, or skill..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-900/50 border-slate-700/50 text-slate-200 placeholder:text-slate-500 focus:border-blue-600/50 focus:ring-blue-600/20"
            />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full flex bg-slate-900/50 border border-slate-700/50 p-1 rounded-xl mb-4 overflow-x-auto">
              <TabsTrigger value="all" className="flex-1 min-w-fit text-xs sm:text-sm data-[state=active]:bg-slate-700 data-[state=active]:text-white rounded-lg">
                All ({agents.length})
              </TabsTrigger>
              {[0, 1, 2, 3].map((tier) => (
                <TabsTrigger
                  key={tier}
                  value={String(tier)}
                  className="flex-1 min-w-fit text-xs sm:text-sm data-[state=active]:text-white rounded-lg"
                  style={activeTab === String(tier) ? { backgroundColor: `${tierConfig[tier].color}30`, color: tierConfig[tier].color } : {}}
                >
                  T{tier} ({tierCounts[tier]})
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredAgents.length > 0 ? (
                filteredAgents.map((agent) => <AgentCard key={agent.id} agent={agent} />)
              ) : (
                <div className="col-span-full text-center py-16 text-slate-500">
                  <Search size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-lg font-medium">No agents found</p>
                  <p className="text-sm mt-1">Try adjusting your search or filter criteria</p>
                </div>
              )}
            </div>
          </Tabs>
        </section>

        <Separator className="bg-slate-800/50" />

        <section>
          <button
            onClick={() => toggleSection("priority")}
            className="w-full flex items-center justify-between py-3 text-left"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} className="text-amber-400" />
              <h2 className="text-xl sm:text-2xl font-bold text-slate-100">Priority Matrix</h2>
            </div>
            <ChevronDown size={20} className="text-slate-500 transition-transform duration-200" style={{ transform: expandedSection.priority ? "rotate(180deg)" : "rotate(0deg)" }} />
          </button>
          <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: expandedSection.priority ? "1000px" : "0px", opacity: expandedSection.priority ? 1 : 0 }}>
            <div className="pt-2 pb-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/50 hover:bg-transparent">
                    <TableHead className="text-slate-400 text-xs uppercase tracking-wider">Category</TableHead>
                    <TableHead className="text-slate-400 text-xs uppercase tracking-wider">Key Agents</TableHead>
                    <TableHead className="text-slate-400 text-xs uppercase tracking-wider">Priority</TableHead>
                    <TableHead className="text-slate-400 text-xs uppercase tracking-wider">Phase</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priorityMatrix.map((row, i) => (
                    <TableRow key={i} className="border-slate-800/50 hover:bg-slate-900/30">
                      <TableCell className="font-medium text-slate-200 text-sm">{row.category}</TableCell>
                      <TableCell className="text-slate-400 text-sm">{row.agents}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${row.color} border-transparent`}>{row.priority}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm">{row.phase}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>

        <Separator className="bg-slate-800/50" />

        <section>
          <button
            onClick={() => toggleSection("communication")}
            className="w-full flex items-center justify-between py-3 text-left"
          >
            <div className="flex items-center gap-3">
              <Network size={20} className="text-teal-400" />
              <h2 className="text-xl sm:text-2xl font-bold text-slate-100">Communication Flow</h2>
            </div>
            <ChevronDown size={20} className="text-slate-500 transition-transform duration-200" style={{ transform: expandedSection.communication ? "rotate(180deg)" : "rotate(0deg)" }} />
          </button>
          <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: expandedSection.communication ? "800px" : "0px", opacity: expandedSection.communication ? 1 : 0 }}>
            <div className="pt-2 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { title: "Vertical Chain", desc: "Governance sets guardrails that flow down through Executive decisions, Management execution, and Operational delivery. Escalations flow upward.", icon: ArrowRight, color: "text-blue-400", bg: "bg-blue-950/30 border-blue-800/40" },
                { title: "Horizontal Collaboration", desc: "Agents within the same tier collaborate freely. Cross-functional pods form around initiatives (e.g., RevOps + Sales + Marketing for pipeline optimization).", icon: Share2, color: "text-purple-400", bg: "bg-purple-950/30 border-purple-800/40" },
                { title: "Feedback Loops", desc: "Operational agents feed performance data upward. Data & BI aggregates insights for Management and Executive decision-making. Continuous improvement cycles.", icon: TrendingUp, color: "text-teal-400", bg: "bg-teal-950/30 border-teal-800/40" },
                { title: "Audit & Oversight", desc: "Governance agents have read-access across all tiers. Ethics and Audit can flag, pause, or request review of any agent's actions at any tier.", icon: Shield, color: "text-red-400", bg: "bg-red-950/30 border-red-800/40" },
              ].map((item, i) => {
                const FlowIcon = item.icon;
                return (
                  <Card key={i} className={`border ${item.bg}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <FlowIcon size={18} className={item.color} />
                        <CardTitle className="text-sm font-semibold text-slate-200">{item.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <Separator className="bg-slate-800/50" />

        <section>
          <button
            onClick={() => toggleSection("roadmap")}
            className="w-full flex items-center justify-between py-3 text-left"
          >
            <div className="flex items-center gap-3">
              <Clock size={20} className="text-green-400" />
              <h2 className="text-xl sm:text-2xl font-bold text-slate-100">Implementation Roadmap</h2>
            </div>
            <ChevronDown size={20} className="text-slate-500 transition-transform duration-200" style={{ transform: expandedSection.roadmap ? "rotate(180deg)" : "rotate(0deg)" }} />
          </button>
          <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: expandedSection.roadmap ? "2000px" : "0px", opacity: expandedSection.roadmap ? 1 : 0 }}>
            <div className="pt-2 pb-4 space-y-4">
              {roadmapPhases.map((phase, i) => {
                const PhaseIcon = phase.icon;
                const colors = ["border-red-800/40 bg-red-950/20", "border-amber-800/40 bg-amber-950/20", "border-blue-800/40 bg-blue-950/20", "border-green-800/40 bg-green-950/20"];
                const dotColors = ["bg-red-500", "bg-amber-500", "bg-blue-500", "bg-green-500"];
                return (
                  <Card key={i} className={`border ${colors[i]}`}>
                    <CardHeader className="pb-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full ${dotColors[i]}`} style={{ boxShadow: `0 0 8px ${["#DC2626", "#D97706", "#2563EB", "#16A34A"][i]}60` }} />
                          <PhaseIcon size={18} className="text-slate-400" />
                          <div>
                            <CardTitle className="text-base font-semibold text-slate-200">{phase.phase}: {phase.title}</CardTitle>
                          </div>
                        </div>
                        <Badge variant="outline" className="self-start sm:self-auto text-xs bg-slate-800/50 text-slate-300 border-slate-600/50">
                          {phase.duration}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 ml-5">
                        {phase.items.map((item, j) => (
                          <div key={j} className="flex items-start gap-2">
                            <CheckCircle size={14} className="text-slate-600 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-slate-400">{item}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <div className="text-center py-8 border-t border-slate-800/50">
          <p className="text-xs text-slate-600">Enterprise AI Agent Organization Blueprint v2.0 — 4-Layer Architecture with 31 Agents</p>
        </div>
      </div>
    </div>
  );
}