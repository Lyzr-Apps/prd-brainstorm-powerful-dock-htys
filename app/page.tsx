'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent, AIAgentResponse, uploadFiles, UploadResponse } from '@/lib/aiAgent'
import { copyToClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Progress } from '@/components/ui/progress'
import {
  FiSend,
  FiCheck,
  FiAlertTriangle,
  FiFileText,
  FiChevronRight,
  FiChevronLeft,
  FiCopy,
  FiMenu,
  FiLoader,
  FiCircle,
  FiCheckCircle,
  FiClock,
  FiEdit3,
  FiX,
  FiMessageSquare,
  FiEye,
  FiPaperclip,
  FiUploadCloud,
  FiFile,
} from 'react-icons/fi'

// ─── Constants ───
const AGENT_ID = '69976ea431f64502bf319c80'

const THEME_VARS = {
  '--background': '40 30% 96%',
  '--foreground': '30 25% 18%',
  '--card': '40 35% 98%',
  '--card-foreground': '30 25% 18%',
  '--primary': '25 55% 40%',
  '--primary-foreground': '40 30% 98%',
  '--secondary': '40 25% 90%',
  '--secondary-foreground': '30 25% 22%',
  '--accent': '15 60% 45%',
  '--accent-foreground': '40 30% 98%',
  '--muted': '40 20% 88%',
  '--muted-foreground': '30 15% 45%',
  '--border': '35 25% 82%',
  '--input': '35 20% 75%',
  '--ring': '25 55% 40%',
  '--destructive': '0 65% 50%',
  '--radius': '0.5rem',
  '--sidebar-background': '40 28% 94%',
  '--sidebar-foreground': '30 25% 18%',
  '--sidebar-border': '35 22% 85%',
  '--sidebar-primary': '25 55% 40%',
  '--sidebar-accent': '40 22% 88%',
} as React.CSSProperties

// ─── Types ───
interface AgentData {
  message: string
  current_stage: string
  review_action_needed: boolean
  section_title: string
  section_content: string
  approved_sections: string[]
  gap_items: string[]
}

interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  agentData?: AgentData
  timestamp: string
  attachedFiles?: { name: string; size: string }[]
}

interface ApprovedSection {
  title: string
  content: string
}

interface AttachedFile {
  file: File
  name: string
  size: string
  uploading: boolean
  uploaded: boolean
  assetId?: string
  error?: string
}

// ─── File upload prompt template ───
const FILE_UPLOAD_PROMPT = `I have uploaded document(s) that contain information about my product idea. Please analyze the uploaded file(s) and extract answers to the following 8 key PRD questions:

1. **Product/Feature Description:** What product or feature is being described?
2. **Problem Statement:** What problem does it solve? Who experiences this problem?
3. **Target Users:** Who are the target users/personas?
4. **Goals & Objectives:** What are the primary goals and success metrics?
5. **Use Cases:** What are the key use cases or user stories?
6. **Requirements:** What are the functional, business, and technical requirements?
7. **Competitive Landscape:** Who are the competitors or existing alternatives?
8. **Risks & Constraints:** What are the known risks, constraints, or dependencies?

Please extract as much detail as possible from the uploaded document(s) and present your findings. Then we can proceed with the PRD building process using this information.`

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ─── Stage definitions ───
const STAGES = [
  { key: 'information_gathering', label: 'Information Gathering', short: 'Gather' },
  { key: 'review_1_problem_goals', label: 'Problem & Goals', short: 'Review 1' },
  { key: 'review_2_use_cases', label: 'Use Cases', short: 'Review 2' },
  { key: 'review_3_requirements', label: 'Requirements & Analysis', short: 'Review 3' },
  { key: 'review_4_risks', label: 'Risks', short: 'Review 4' },
  { key: 'gap_analysis', label: 'Gap Analysis & Next Steps', short: 'Gaps' },
  { key: 'completed', label: 'Completed', short: 'Done' },
]

// ─── Sample data ───
const SAMPLE_MESSAGES: ChatMessage[] = [
  {
    id: 's1',
    role: 'agent',
    content: '',
    agentData: {
      message: 'Welcome to PRD Builder Pro! I will guide you through creating a comprehensive Product Requirements Document with 4 review checkpoints. Let us start by understanding your product idea. What product or feature are you looking to build?',
      current_stage: 'information_gathering',
      review_action_needed: false,
      section_title: '',
      section_content: '',
      approved_sections: [],
      gap_items: [],
    },
    timestamp: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: 's2',
    role: 'user',
    content: 'I want to build a project management tool for remote teams with real-time collaboration features, task tracking, and automated reporting.',
    timestamp: new Date(Date.now() - 240000).toISOString(),
  },
  {
    id: 's3',
    role: 'agent',
    content: '',
    agentData: {
      message: 'Great product idea! I have drafted the Problem Statement & Goals section based on your input. Please review this section carefully.',
      current_stage: 'review_1_problem_goals',
      review_action_needed: true,
      section_title: 'Problem Statement & Goals',
      section_content: '## Problem Statement\n\nRemote teams struggle with fragmented communication, lack of real-time visibility into project progress, and manual reporting processes that consume valuable time.\n\n## Goals\n\n- **Primary Goal:** Provide a unified platform for remote team collaboration and project management\n- **Secondary Goal:** Reduce time spent on status reporting by 60% through automation\n- **Tertiary Goal:** Improve task completion rates by 25% through better visibility and accountability\n\n## Success Metrics\n\n- Daily active users within target organizations\n- Average time-to-completion for tasks\n- Reduction in weekly status meeting duration\n- User satisfaction score (NPS > 50)',
      approved_sections: [],
      gap_items: [],
    },
    timestamp: new Date(Date.now() - 180000).toISOString(),
  },
  {
    id: 's4',
    role: 'user',
    content: 'I approve this section',
    timestamp: new Date(Date.now() - 120000).toISOString(),
  },
  {
    id: 's5',
    role: 'agent',
    content: '',
    agentData: {
      message: 'Section approved! Moving on to Use Cases. I will now draft the key use cases for your project management tool.',
      current_stage: 'review_2_use_cases',
      review_action_needed: true,
      section_title: 'Use Cases',
      section_content: '## Core Use Cases\n\n### UC-1: Task Creation and Assignment\n- **Actor:** Team Lead\n- **Flow:** Create task with description, priority, deadline, and assignee\n- **Outcome:** Task appears in assignee dashboard with notification\n\n### UC-2: Real-time Collaboration\n- **Actor:** Team Members\n- **Flow:** Multiple users edit shared documents, comment on tasks, and receive live updates\n- **Outcome:** All changes visible instantly to all participants\n\n### UC-3: Automated Reporting\n- **Actor:** Project Manager\n- **Flow:** System auto-generates weekly progress reports based on task data\n- **Outcome:** Report delivered via email/Slack with key metrics',
      approved_sections: ['Problem Statement & Goals'],
      gap_items: [],
    },
    timestamp: new Date(Date.now() - 60000).toISOString(),
  },
]

const SAMPLE_APPROVED: ApprovedSection[] = [
  {
    title: 'Problem Statement & Goals',
    content: '## Problem Statement\n\nRemote teams struggle with fragmented communication, lack of real-time visibility into project progress, and manual reporting processes.\n\n## Goals\n\n- Provide a unified platform for remote team collaboration\n- Reduce time spent on status reporting by 60%\n- Improve task completion rates by 25%',
  },
]

// ─── Markdown renderer ───
function formatInline(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) {
    const linkParts = text.split(/(https?:\/\/[^\s]+)/g)
    if (linkParts.length === 1) return text
    return linkParts.map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'hsl(25 55% 40%)' }}>
          {part}
        </a>
      ) : (
        part
      )
    )
  }
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  )
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return (
            <h4 key={i} className="font-semibold text-sm mt-3 mb-1" style={{ color: 'hsl(30 25% 18%)' }}>
              {formatInline(line.slice(4))}
            </h4>
          )
        if (line.startsWith('## '))
          return (
            <h3 key={i} className="font-semibold text-base mt-3 mb-1" style={{ color: 'hsl(30 25% 18%)' }}>
              {formatInline(line.slice(3))}
            </h3>
          )
        if (line.startsWith('# '))
          return (
            <h2 key={i} className="font-bold text-lg mt-4 mb-2" style={{ color: 'hsl(30 25% 18%)' }}>
              {formatInline(line.slice(2))}
            </h2>
          )
        if (line.startsWith('- ') || line.startsWith('* '))
          return (
            <li key={i} className="ml-4 list-disc text-sm leading-relaxed" style={{ color: 'hsl(30 15% 45%)' }}>
              {formatInline(line.slice(2))}
            </li>
          )
        if (/^\d+\.\s/.test(line))
          return (
            <li key={i} className="ml-4 list-decimal text-sm leading-relaxed" style={{ color: 'hsl(30 15% 45%)' }}>
              {formatInline(line.replace(/^\d+\.\s/, ''))}
            </li>
          )
        if (!line.trim()) return <div key={i} className="h-1" />
        return (
          <p key={i} className="text-sm leading-relaxed" style={{ color: 'hsl(30 25% 18%)' }}>
            {formatInline(line)}
          </p>
        )
      })}
    </div>
  )
}

// ─── Helpers ───
function parseAgentResponse(result: AIAgentResponse): AgentData | null {
  if (!result?.success) return null
  const agentData = result?.response?.result as unknown
  let parsed: Record<string, unknown> = {}
  if (typeof agentData === 'string') {
    try {
      parsed = JSON.parse(agentData)
    } catch {
      parsed = { message: agentData }
    }
  } else if (agentData && typeof agentData === 'object') {
    parsed = agentData as Record<string, unknown>
  }

  return {
    message: (typeof parsed?.message === 'string' ? parsed.message : '') || result?.response?.message || '',
    current_stage: (typeof parsed?.current_stage === 'string' ? parsed.current_stage : '') || 'information_gathering',
    review_action_needed: typeof parsed?.review_action_needed === 'boolean' ? parsed.review_action_needed : false,
    section_title: typeof parsed?.section_title === 'string' ? parsed.section_title : '',
    section_content: typeof parsed?.section_content === 'string' ? parsed.section_content : '',
    approved_sections: Array.isArray(parsed?.approved_sections) ? (parsed.approved_sections as string[]) : [],
    gap_items: Array.isArray(parsed?.gap_items) ? (parsed.gap_items as string[]) : [],
  }
}

function getStageIndex(stage: string): number {
  return STAGES.findIndex((s) => s.key === stage)
}

function getStageName(stage: string): string {
  const found = STAGES.find((s) => s.key === stage)
  return found?.label ?? 'Information Gathering'
}

// ─── Sidebar Stage Tracker ───
function StageTracker({
  currentStage,
  approvedSections,
}: {
  currentStage: string
  approvedSections: ApprovedSection[]
}) {
  const currentIdx = getStageIndex(currentStage)
  const approvedTitles = approvedSections.map((s) => s.title)

  return (
    <div className="space-y-1">
      {STAGES.map((stage, idx) => {
        const isActive = stage.key === currentStage
        const isPast = idx < currentIdx
        const isCompleted = stage.key === 'completed' && currentStage === 'completed'

        let statusIcon = <FiCircle className="w-3.5 h-3.5 shrink-0" style={{ color: 'hsl(30 15% 45%)' }} />
        let statusLabel = 'Pending'
        let statusVariant: 'outline' | 'default' | 'secondary' = 'outline'

        if (isCompleted || isPast) {
          statusIcon = <FiCheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: 'hsl(25 55% 40%)' }} />
          statusLabel = 'Approved'
          statusVariant = 'default'
        } else if (isActive) {
          statusIcon = <FiClock className="w-3.5 h-3.5 shrink-0 animate-pulse" style={{ color: 'hsl(15 60% 45%)' }} />
          statusLabel = 'In Review'
          statusVariant = 'secondary'
        }

        // Also mark as approved if some review stage has its section approved
        const stageReviewMap: Record<string, string> = {
          review_1_problem_goals: 'Problem Statement & Goals',
          review_2_use_cases: 'Use Cases',
          review_3_requirements: 'Requirements & Analysis',
          review_4_risks: 'Risks',
        }
        if (stageReviewMap[stage.key] && approvedTitles.includes(stageReviewMap[stage.key])) {
          statusIcon = <FiCheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: 'hsl(25 55% 40%)' }} />
          statusLabel = 'Approved'
          statusVariant = 'default'
        }

        return (
          <div
            key={stage.key}
            className={cn(
              'flex items-start gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-200',
              isActive ? 'shadow-sm' : ''
            )}
            style={{
              backgroundColor: isActive ? 'hsl(40 25% 90%)' : 'transparent',
              borderLeft: isActive ? '3px solid hsl(25 55% 40%)' : '3px solid transparent',
            }}
          >
            <div className="pt-0.5">{statusIcon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: isActive ? 'hsl(30 25% 18%)' : 'hsl(30 15% 45%)' }}>
                {stage.label}
              </p>
              <Badge
                variant={statusVariant}
                className="mt-1 text-[10px] px-1.5 py-0"
              >
                {statusLabel}
              </Badge>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Review Action Card ───
function ReviewActionCard({
  sectionTitle,
  sectionContent,
  onApprove,
  onRequestChanges,
  isLoading,
}: {
  sectionTitle: string
  sectionContent: string
  onApprove: () => void
  onRequestChanges: (feedback: string) => void
  isLoading: boolean
}) {
  const [showChangeInput, setShowChangeInput] = useState(false)
  const [localChangeText, setLocalChangeText] = useState('')

  return (
    <Card
      className="mt-3 overflow-hidden"
      style={{
        backgroundColor: 'hsl(40 35% 98%)',
        border: '2px solid hsl(25 55% 40%)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      }}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <FiEye className="w-4 h-4" style={{ color: 'hsl(25 55% 40%)' }} />
          <CardTitle className="text-sm font-semibold" style={{ color: 'hsl(25 55% 40%)' }}>
            Review: {sectionTitle}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div
          className="p-3 rounded-md max-h-60 overflow-y-auto text-sm"
          style={{ backgroundColor: 'hsl(40 30% 96%)', border: '1px solid hsl(35 25% 82%)' }}
        >
          {renderMarkdown(sectionContent)}
        </div>

        {showChangeInput ? (
          <div className="space-y-2">
            <Textarea
              placeholder="Describe the changes you would like..."
              value={localChangeText}
              onChange={(e) => setLocalChangeText(e.target.value)}
              rows={3}
              className="text-sm"
              style={{ backgroundColor: 'hsl(40 30% 96%)', borderColor: 'hsl(35 25% 82%)', color: 'hsl(30 25% 18%)' }}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (localChangeText.trim()) {
                    onRequestChanges(localChangeText)
                    setShowChangeInput(false)
                    setLocalChangeText('')
                  }
                }}
                disabled={isLoading || !localChangeText.trim()}
                style={{ backgroundColor: 'hsl(15 60% 45%)', color: 'hsl(40 30% 98%)' }}
              >
                {isLoading ? <FiLoader className="w-3 h-3 mr-1 animate-spin" /> : <FiSend className="w-3 h-3 mr-1" />}
                Send Feedback
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setShowChangeInput(false); setLocalChangeText('') }}
                style={{ borderColor: 'hsl(35 25% 82%)', color: 'hsl(30 15% 45%)' }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={onApprove}
              disabled={isLoading}
              className="flex-1"
              style={{ backgroundColor: 'hsl(25 55% 40%)', color: 'hsl(40 30% 98%)' }}
            >
              {isLoading ? <FiLoader className="w-3 h-3 mr-1 animate-spin" /> : <FiCheck className="w-3 h-3 mr-1" />}
              Approve Section
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowChangeInput(true)}
              disabled={isLoading}
              className="flex-1"
              style={{ borderColor: 'hsl(25 55% 40%)', color: 'hsl(25 55% 40%)' }}
            >
              <FiEdit3 className="w-3 h-3 mr-1" />
              Request Changes
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Gap Items Display ───
function GapItemsDisplay({ items }: { items: string[] }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'hsl(0 65% 50%)' }}>
        <FiAlertTriangle className="w-3.5 h-3.5" />
        <span>Gaps Identified:</span>
      </div>
      {items.map((item, idx) => (
        <div
          key={idx}
          className="flex items-start gap-2 px-3 py-2 rounded-md text-xs"
          style={{ backgroundColor: 'hsl(0 65% 97%)', border: '1px solid hsl(0 40% 90%)', color: 'hsl(0 45% 35%)' }}
        >
          <FiAlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{item}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Chat Message Bubble ───
function MessageBubble({
  message,
  onApprove,
  onRequestChanges,
  isLoading,
}: {
  message: ChatMessage
  onApprove: (title: string, content: string) => void
  onRequestChanges: (feedback: string) => void
  isLoading: boolean
}) {
  if (message.role === 'user') {
    const hasFiles = Array.isArray(message.attachedFiles) && message.attachedFiles.length > 0
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[75%] space-y-1.5">
          {hasFiles && (
            <div className="flex flex-wrap gap-1.5 justify-end">
              {message.attachedFiles!.map((f, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px]"
                  style={{
                    backgroundColor: 'hsl(25 55% 35%)',
                    color: 'hsl(40 30% 92%)',
                  }}
                >
                  <FiFile className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[140px]">{f.name}</span>
                  <span className="opacity-60">({f.size})</span>
                </div>
              ))}
            </div>
          )}
          <div
            className="px-4 py-3 rounded-2xl rounded-br-sm text-sm"
            style={{
              backgroundColor: 'hsl(25 55% 40%)',
              color: 'hsl(40 30% 98%)',
              lineHeight: '1.65',
            }}
          >
            {message.content}
          </div>
        </div>
      </div>
    )
  }

  const data = message.agentData
  const displayMessage = data?.message ?? message.content
  const hasReview = data?.review_action_needed && data?.section_title && data?.section_content

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[85%] space-y-0">
        <div
          className="px-4 py-3 rounded-2xl rounded-bl-sm text-sm"
          style={{
            backgroundColor: 'hsl(40 35% 98%)',
            border: '1px solid hsl(35 25% 82%)',
            color: 'hsl(30 25% 18%)',
            lineHeight: '1.65',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          {renderMarkdown(displayMessage)}
        </div>

        {hasReview && (
          <ReviewActionCard
            sectionTitle={data?.section_title ?? ''}
            sectionContent={data?.section_content ?? ''}
            onApprove={() => onApprove(data?.section_title ?? '', data?.section_content ?? '')}
            onRequestChanges={onRequestChanges}
            isLoading={isLoading}
          />
        )}

        {data?.gap_items && <GapItemsDisplay items={data.gap_items} />}
      </div>
    </div>
  )
}

// ─── PRD Preview Panel ───
function PRDPreview({
  approvedSections,
  currentStage,
  onClose,
}: {
  approvedSections: ApprovedSection[]
  currentStage: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const allSectionTitles = [
    'Problem Statement & Goals',
    'Use Cases',
    'Requirements & Analysis',
    'Risks',
    'Gap Analysis & Next Steps',
  ]

  const handleExport = async () => {
    const fullPRD = approvedSections
      .map((s) => `# ${s.title}\n\n${s.content}`)
      .join('\n\n---\n\n')
    const success = await copyToClipboard(fullPRD || 'No approved sections yet.')
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div
      className="h-full flex flex-col"
      style={{ backgroundColor: 'hsl(40 28% 94%)', borderLeft: '1px solid hsl(35 22% 85%)' }}
    >
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid hsl(35 22% 85%)' }}>
        <div className="flex items-center gap-2">
          <FiFileText className="w-4 h-4" style={{ color: 'hsl(25 55% 40%)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'hsl(30 25% 18%)' }}>PRD Preview</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-7 w-7 p-0"
          style={{ color: 'hsl(30 15% 45%)' }}
        >
          <FiX className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-4 py-3">
        <div className="space-y-4 pb-4">
          {allSectionTitles.map((title) => {
            const approved = approvedSections.find((s) => s.title === title)
            if (approved) {
              return (
                <Card key={title} style={{ backgroundColor: 'hsl(40 35% 98%)', border: '1px solid hsl(35 25% 82%)' }}>
                  <CardHeader className="pb-2 pt-3 px-3">
                    <div className="flex items-center gap-1.5">
                      <FiCheckCircle className="w-3.5 h-3.5" style={{ color: 'hsl(25 55% 40%)' }} />
                      <CardTitle className="text-xs font-semibold" style={{ color: 'hsl(25 55% 40%)' }}>
                        {approved.title}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="text-xs" style={{ color: 'hsl(30 25% 18%)' }}>
                      {renderMarkdown(approved.content)}
                    </div>
                  </CardContent>
                </Card>
              )
            }
            return (
              <div
                key={title}
                className="px-3 py-3 rounded-lg"
                style={{ backgroundColor: 'hsl(40 20% 88%)', border: '1px dashed hsl(35 25% 82%)' }}
              >
                <div className="flex items-center gap-1.5">
                  <FiCircle className="w-3 h-3" style={{ color: 'hsl(30 15% 45%)' }} />
                  <span className="text-xs font-medium" style={{ color: 'hsl(30 15% 45%)' }}>
                    {title}
                  </span>
                  <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0" style={{ borderColor: 'hsl(35 25% 82%)', color: 'hsl(30 15% 45%)' }}>
                    Pending
                  </Badge>
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <div className="px-4 py-3" style={{ borderTop: '1px solid hsl(35 22% 85%)' }}>
        <Button
          size="sm"
          onClick={handleExport}
          className="w-full text-xs"
          disabled={approvedSections.length === 0}
          style={{
            backgroundColor: approvedSections.length > 0 ? 'hsl(25 55% 40%)' : 'hsl(40 20% 88%)',
            color: approvedSections.length > 0 ? 'hsl(40 30% 98%)' : 'hsl(30 15% 45%)',
          }}
        >
          {copied ? (
            <>
              <FiCheck className="w-3 h-3 mr-1.5" />
              Copied to Clipboard
            </>
          ) : (
            <>
              <FiCopy className="w-3 h-3 mr-1.5" />
              Export PRD
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// ─── Loading Skeleton ───
function AgentTypingSkeleton() {
  return (
    <div className="flex justify-start mb-4">
      <div
        className="max-w-[75%] px-4 py-4 rounded-2xl rounded-bl-sm space-y-2"
        style={{
          backgroundColor: 'hsl(40 35% 98%)',
          border: '1px solid hsl(35 25% 82%)',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <FiLoader className="w-3.5 h-3.5 animate-spin" style={{ color: 'hsl(25 55% 40%)' }} />
          <span className="text-xs font-medium" style={{ color: 'hsl(30 15% 45%)' }}>Generating response...</span>
        </div>
        <Skeleton className="h-3 w-[260px]" style={{ backgroundColor: 'hsl(40 20% 88%)' }} />
        <Skeleton className="h-3 w-[200px]" style={{ backgroundColor: 'hsl(40 20% 88%)' }} />
        <Skeleton className="h-3 w-[230px]" style={{ backgroundColor: 'hsl(40 20% 88%)' }} />
      </div>
    </div>
  )
}

// ─── Agent Info Footer ───
function AgentInfoBar({ isActive }: { isActive: boolean }) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 text-xs"
      style={{ backgroundColor: 'hsl(40 28% 94%)', borderTop: '1px solid hsl(35 22% 85%)', color: 'hsl(30 15% 45%)' }}
    >
      <div className="flex items-center gap-1.5">
        <div
          className={cn('w-2 h-2 rounded-full', isActive ? 'animate-pulse' : '')}
          style={{ backgroundColor: isActive ? 'hsl(15 60% 45%)' : 'hsl(25 55% 40%)' }}
        />
        <span className="font-medium">PRD Builder Agent</span>
      </div>
      <Separator orientation="vertical" className="h-3" style={{ backgroundColor: 'hsl(35 25% 82%)' }} />
      <span>Expert Product Manager chatbot with staged reviews</span>
    </div>
  )
}

// ─── ErrorBoundary ───
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'hsl(40 30% 96%)', color: 'hsl(30 25% 18%)' }}>
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-sm mb-4" style={{ color: 'hsl(30 15% 45%)' }}>{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 rounded-md text-sm font-medium"
              style={{ backgroundColor: 'hsl(25 55% 40%)', color: 'hsl(40 30% 98%)' }}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Main Page ───
export default function Page() {
  const [sessionId] = useState(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    return Date.now().toString()
  })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [currentStage, setCurrentStage] = useState('information_gathering')
  const [approvedSections, setApprovedSections] = useState<ApprovedSection[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [showSampleData, setShowSampleData] = useState(false)
  const [hasInitialized, setHasInitialized] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Handle file selection
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newFiles: AttachedFile[] = Array.from(files).map((file) => ({
      file,
      name: file.name,
      size: formatFileSize(file.size),
      uploading: true,
      uploaded: false,
    }))

    setAttachedFiles((prev) => [...prev, ...newFiles])
    setIsUploading(true)
    setUploadProgress(0)

    // Upload each file
    const totalFiles = newFiles.length
    let completedFiles = 0

    for (const attachedFile of newFiles) {
      try {
        const uploadResult: UploadResponse = await uploadFiles(attachedFile.file)
        completedFiles++
        setUploadProgress(Math.round((completedFiles / totalFiles) * 100))

        if (uploadResult.success && uploadResult.asset_ids.length > 0) {
          setAttachedFiles((prev) =>
            prev.map((f) =>
              f.name === attachedFile.name && f.uploading
                ? { ...f, uploading: false, uploaded: true, assetId: uploadResult.asset_ids[0] }
                : f
            )
          )
        } else {
          setAttachedFiles((prev) =>
            prev.map((f) =>
              f.name === attachedFile.name && f.uploading
                ? { ...f, uploading: false, uploaded: false, error: uploadResult.error || 'Upload failed' }
                : f
            )
          )
        }
      } catch {
        completedFiles++
        setUploadProgress(Math.round((completedFiles / totalFiles) * 100))
        setAttachedFiles((prev) =>
          prev.map((f) =>
            f.name === attachedFile.name && f.uploading
              ? { ...f, uploading: false, uploaded: false, error: 'Upload failed' }
              : f
          )
        )
      }
    }

    setIsUploading(false)
    setUploadProgress(100)
    // Reset the file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  // Remove an attached file
  const removeAttachedFile = useCallback((name: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.name !== name))
  }, [])

  // Clear all attached files
  const clearAttachedFiles = useCallback(() => {
    setAttachedFiles([])
    setUploadProgress(0)
  }, [])

  // Send message to agent
  const sendMessage = useCallback(
    async (text: string, showInChat: boolean = true, fileAssets?: string[], fileInfos?: { name: string; size: string }[]) => {
      if ((!text.trim() && (!fileAssets || fileAssets.length === 0)) || isLoading) return

      // Build the actual message to send
      let messageToSend = text.trim()
      const hasFileAttachments = fileAssets && fileAssets.length > 0

      // If files are attached and no custom text, use the file upload prompt
      if (hasFileAttachments && !messageToSend) {
        messageToSend = FILE_UPLOAD_PROMPT
      } else if (hasFileAttachments && messageToSend) {
        // If user wrote something AND attached files, prepend context
        messageToSend = `I have uploaded document(s) for context. ${messageToSend}\n\nPlease also analyze the uploaded file(s) and extract relevant information for the PRD, focusing on:\n1. Product/Feature Description\n2. Problem Statement\n3. Target Users\n4. Goals & Objectives\n5. Use Cases\n6. Requirements (Functional, Business, Technical)\n7. Competitive Landscape\n8. Risks & Constraints`
      }

      if (showInChat) {
        const displayContent = hasFileAttachments
          ? (text.trim() || 'Uploaded document(s) for PRD analysis')
          : text
        const userMsg: ChatMessage = {
          id: Date.now().toString(),
          role: 'user',
          content: displayContent,
          timestamp: new Date().toISOString(),
          attachedFiles: fileInfos,
        }
        setMessages((prev) => [...prev, userMsg])
      }
      setInputValue('')
      setAttachedFiles([])
      setUploadProgress(0)
      setIsLoading(true)
      setErrorMessage('')

      try {
        const result = await callAIAgent(messageToSend, AGENT_ID, {
          session_id: sessionId,
          assets: hasFileAttachments ? fileAssets : undefined,
        })
        const agentData = parseAgentResponse(result)

        if (agentData) {
          const agentMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'agent',
            content: agentData.message,
            agentData,
            timestamp: new Date().toISOString(),
          }
          setMessages((prev) => [...prev, agentMsg])

          if (agentData.current_stage) {
            setCurrentStage(agentData.current_stage)
          }

          // Update approved sections from agent response
          if (Array.isArray(agentData.approved_sections) && agentData.approved_sections.length > 0) {
            setApprovedSections((prev) => {
              const existingTitles = prev.map((s) => s.title)
              const newSections = agentData.approved_sections
                .filter((title: string) => !existingTitles.includes(title))
                .map((title: string) => ({ title, content: '' }))
              return [...prev, ...newSections]
            })
          }
        } else {
          // Fallback: display raw text
          const fallbackMsg = result?.response?.message || result?.response?.result?.text || 'No response received.'
          const agentMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'agent',
            content: typeof fallbackMsg === 'string' ? fallbackMsg : 'No response received.',
            timestamp: new Date().toISOString(),
          }
          setMessages((prev) => [...prev, agentMsg])
        }
      } catch {
        setErrorMessage('Failed to get a response. Please try again.')
        const errMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: 'Sorry, something went wrong. Please try again.',
          timestamp: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, errMsg])
      } finally {
        setIsLoading(false)
      }
    },
    [isLoading, sessionId]
  )

  // Initialize conversation
  useEffect(() => {
    if (!hasInitialized && !showSampleData) {
      setHasInitialized(true)
      sendMessage('Hello, I want to build a PRD', false)
    }
  }, [hasInitialized, showSampleData, sendMessage])

  // Handle approve section
  const handleApprove = useCallback(
    (title: string, content: string) => {
      setApprovedSections((prev) => {
        const exists = prev.find((s) => s.title === title)
        if (exists) return prev
        return [...prev, { title, content }]
      })
      sendMessage('I approve this section')
    },
    [sendMessage]
  )

  // Handle request changes
  const handleRequestChanges = useCallback(
    (feedback: string) => {
      if (feedback.trim()) {
        sendMessage(`I would like the following changes: ${feedback}`)
      }
    },
    [sendMessage]
  )

  // Send message with files helper
  const handleSend = useCallback(() => {
    const uploadedAssets = attachedFiles
      .filter((f) => f.uploaded && f.assetId)
      .map((f) => f.assetId!)
    const fileInfos = attachedFiles
      .filter((f) => f.uploaded && f.assetId)
      .map((f) => ({ name: f.name, size: f.size }))
    sendMessage(inputValue, true, uploadedAssets.length > 0 ? uploadedAssets : undefined, fileInfos.length > 0 ? fileInfos : undefined)
  }, [inputValue, attachedFiles, sendMessage])

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Check if we can send (either have text or have uploaded files)
  const canSend = !isLoading && !showSampleData && !isUploading && (inputValue.trim().length > 0 || attachedFiles.some((f) => f.uploaded && f.assetId))

  // Displayed data
  const displayMessages = showSampleData ? SAMPLE_MESSAGES : messages
  const displayApproved = showSampleData ? SAMPLE_APPROVED : approvedSections
  const displayStage = showSampleData ? 'review_2_use_cases' : currentStage

  return (
    <ErrorBoundary>
      <div style={THEME_VARS} className="min-h-screen font-sans flex flex-col" >
        <div className="flex-1 flex flex-col h-screen" style={{ backgroundColor: 'hsl(40 30% 96%)' }}>
          {/* ─── Top Header ─── */}
          <header
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ backgroundColor: 'hsl(40 35% 98%)', borderBottom: '1px solid hsl(35 25% 82%)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <div className="flex items-center gap-3">
              {/* Mobile sidebar toggle */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="lg:hidden h-8 w-8 p-0" style={{ color: 'hsl(30 25% 18%)' }}>
                    <FiMenu className="w-4 h-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0" style={{ backgroundColor: 'hsl(40 28% 94%)' }}>
                  <SheetHeader className="px-4 pt-4 pb-2">
                    <SheetTitle className="text-sm font-semibold" style={{ color: 'hsl(30 25% 18%)' }}>
                      PRD Stages
                    </SheetTitle>
                  </SheetHeader>
                  <div className="px-2 py-2">
                    <StageTracker currentStage={displayStage} approvedSections={displayApproved} />
                  </div>
                </SheetContent>
              </Sheet>

              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'hsl(25 55% 40%)' }}
                >
                  <FiFileText className="w-4 h-4" style={{ color: 'hsl(40 30% 98%)' }} />
                </div>
                <div>
                  <h1 className="text-sm font-semibold leading-tight" style={{ color: 'hsl(30 25% 18%)' }}>
                    PRD Builder Pro
                  </h1>
                  <p className="text-[10px] leading-tight" style={{ color: 'hsl(30 15% 45%)' }}>
                    Build comprehensive product requirement documents
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Sample Data toggle */}
              <div className="flex items-center gap-2">
                <label htmlFor="sample-toggle" className="text-xs font-medium" style={{ color: 'hsl(30 15% 45%)' }}>
                  Sample Data
                </label>
                <Switch
                  id="sample-toggle"
                  checked={showSampleData}
                  onCheckedChange={setShowSampleData}
                />
              </div>

              {/* PRD Preview toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs gap-1.5 hidden sm:flex"
                style={{
                  borderColor: 'hsl(35 25% 82%)',
                  color: showPreview ? 'hsl(40 30% 98%)' : 'hsl(25 55% 40%)',
                  backgroundColor: showPreview ? 'hsl(25 55% 40%)' : 'transparent',
                }}
              >
                <FiFileText className="w-3.5 h-3.5" />
                PRD Preview
                {showPreview ? <FiChevronRight className="w-3 h-3" /> : <FiChevronLeft className="w-3 h-3" />}
              </Button>
            </div>
          </header>

          {/* ─── Main Content ─── */}
          <div className="flex-1 flex overflow-hidden">
            {/* ─── Left Sidebar (desktop) ─── */}
            <aside
              className="hidden lg:flex flex-col w-56 shrink-0 overflow-y-auto"
              style={{ backgroundColor: 'hsl(40 28% 94%)', borderRight: '1px solid hsl(35 22% 85%)' }}
            >
              <div className="px-3 py-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider mb-3 px-3" style={{ color: 'hsl(30 15% 45%)' }}>
                  Progress
                </h2>
                <StageTracker currentStage={displayStage} approvedSections={displayApproved} />
              </div>

              <div className="mt-auto px-3 pb-3">
                <Separator className="mb-3" style={{ backgroundColor: 'hsl(35 22% 85%)' }} />
                <div className="px-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]" style={{ color: 'hsl(30 15% 45%)' }}>
                    <span>Sections approved</span>
                    <span className="font-semibold" style={{ color: 'hsl(25 55% 40%)' }}>
                      {displayApproved.length}/5
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: 'hsl(40 20% 88%)' }}>
                    <div
                      className="h-1.5 rounded-full transition-all duration-500"
                      style={{ backgroundColor: 'hsl(25 55% 40%)', width: `${(displayApproved.length / 5) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </aside>

            {/* ─── Center Chat ─── */}
            <main className="flex-1 flex flex-col min-w-0">
              {/* Chat messages */}
              <ScrollArea className="flex-1">
                <div className="max-w-2xl mx-auto px-4 py-4">
                  {displayMessages.length === 0 && !isLoading && (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                        style={{ backgroundColor: 'hsl(40 25% 90%)' }}
                      >
                        <FiMessageSquare className="w-7 h-7" style={{ color: 'hsl(25 55% 40%)' }} />
                      </div>
                      <h3 className="text-base font-semibold mb-1" style={{ color: 'hsl(30 25% 18%)' }}>
                        Starting your PRD session...
                      </h3>
                      <p className="text-xs max-w-sm" style={{ color: 'hsl(30 15% 45%)' }}>
                        The PRD Builder agent will guide you through creating a comprehensive Product Requirements Document with structured review checkpoints.
                      </p>
                      <div
                        className="mt-4 px-4 py-3 rounded-xl flex items-start gap-2.5 max-w-sm text-left"
                        style={{ backgroundColor: 'hsl(40 25% 90%)', border: '1px dashed hsl(35 25% 82%)' }}
                      >
                        <FiUploadCloud className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'hsl(25 55% 40%)' }} />
                        <div>
                          <p className="text-xs font-medium" style={{ color: 'hsl(30 25% 18%)' }}>
                            Have existing documents?
                          </p>
                          <p className="text-[11px] mt-0.5" style={{ color: 'hsl(30 15% 45%)' }}>
                            Upload product briefs, specs, or notes using the paperclip button. The agent will extract answers to the 8 key PRD questions automatically.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {displayMessages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      onApprove={handleApprove}
                      onRequestChanges={handleRequestChanges}
                      isLoading={isLoading}
                    />
                  ))}

                  {isLoading && <AgentTypingSkeleton />}

                  {errorMessage && (
                    <div className="flex justify-center mb-4">
                      <div
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                        style={{ backgroundColor: 'hsl(0 65% 97%)', color: 'hsl(0 65% 50%)', border: '1px solid hsl(0 40% 90%)' }}
                      >
                        <FiAlertTriangle className="w-3.5 h-3.5" />
                        {errorMessage}
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              {/* Completed banner */}
              {displayStage === 'completed' && (
                <div
                  className="mx-4 mb-2 px-4 py-3 rounded-lg flex items-center justify-between"
                  style={{ backgroundColor: 'hsl(25 55% 95%)', border: '1px solid hsl(25 55% 80%)' }}
                >
                  <div className="flex items-center gap-2">
                    <FiCheckCircle className="w-4 h-4" style={{ color: 'hsl(25 55% 40%)' }} />
                    <span className="text-sm font-medium" style={{ color: 'hsl(25 55% 40%)' }}>PRD Completed!</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowPreview(true)}
                    className="text-xs"
                    style={{ backgroundColor: 'hsl(25 55% 40%)', color: 'hsl(40 30% 98%)' }}
                  >
                    <FiEye className="w-3 h-3 mr-1.5" />
                    View Full PRD
                  </Button>
                </div>
              )}

              {/* Input area */}
              <div
                className="px-4 py-3 shrink-0"
                style={{ backgroundColor: 'hsl(40 35% 98%)', borderTop: '1px solid hsl(35 25% 82%)' }}
              >
                <div className="max-w-2xl mx-auto">
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx,.pptx,.ppt,.rtf,.json"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {/* Attached files chips */}
                  {attachedFiles.length > 0 && (
                    <div
                      className="mb-2 p-2.5 rounded-xl space-y-2"
                      style={{ backgroundColor: 'hsl(40 30% 96%)', border: '1px solid hsl(35 25% 82%)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'hsl(30 25% 18%)' }}>
                          <FiUploadCloud className="w-3.5 h-3.5" style={{ color: 'hsl(25 55% 40%)' }} />
                          <span>Attached Files ({attachedFiles.length})</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearAttachedFiles}
                          className="h-6 px-2 text-[10px]"
                          style={{ color: 'hsl(30 15% 45%)' }}
                        >
                          Clear all
                        </Button>
                      </div>

                      {isUploading && (
                        <div className="space-y-1">
                          <Progress value={uploadProgress} className="h-1.5" />
                          <p className="text-[10px]" style={{ color: 'hsl(30 15% 45%)' }}>
                            Uploading... {uploadProgress}%
                          </p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5">
                        {attachedFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg text-[11px] group"
                            style={{
                              backgroundColor: file.error
                                ? 'hsl(0 65% 97%)'
                                : file.uploaded
                                ? 'hsl(40 25% 90%)'
                                : 'hsl(40 20% 88%)',
                              border: file.error
                                ? '1px solid hsl(0 40% 85%)'
                                : '1px solid hsl(35 25% 82%)',
                              color: file.error ? 'hsl(0 65% 50%)' : 'hsl(30 25% 18%)',
                            }}
                          >
                            {file.uploading ? (
                              <FiLoader className="w-3 h-3 shrink-0 animate-spin" style={{ color: 'hsl(25 55% 40%)' }} />
                            ) : file.error ? (
                              <FiAlertTriangle className="w-3 h-3 shrink-0" />
                            ) : (
                              <FiFile className="w-3 h-3 shrink-0" style={{ color: 'hsl(25 55% 40%)' }} />
                            )}
                            <span className="truncate max-w-[120px]">{file.name}</span>
                            <span className="opacity-50 ml-0.5">{file.size}</span>
                            {file.uploaded && (
                              <FiCheckCircle className="w-3 h-3 shrink-0 ml-0.5" style={{ color: 'hsl(25 55% 40%)' }} />
                            )}
                            <button
                              onClick={() => removeAttachedFile(file.name)}
                              className="ml-0.5 p-0.5 rounded opacity-40 hover:opacity-100 transition-opacity"
                              style={{ color: 'hsl(30 25% 18%)' }}
                            >
                              <FiX className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {attachedFiles.some((f) => f.uploaded) && (
                        <p className="text-[10px] italic" style={{ color: 'hsl(30 15% 45%)' }}>
                          The agent will analyze your document(s) and extract answers to the 8 key PRD questions.
                          You can add an optional message below or just hit send.
                        </p>
                      )}
                    </div>
                  )}

                  <div
                    className="flex items-end gap-2 p-2 rounded-xl"
                    style={{ backgroundColor: 'hsl(40 30% 96%)', border: '1px solid hsl(35 25% 82%)' }}
                  >
                    {/* File attach button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isLoading || showSampleData || isUploading}
                      className="h-9 w-9 p-0 shrink-0 rounded-lg"
                      title="Attach files (PDF, DOC, TXT, etc.)"
                      style={{ color: 'hsl(30 15% 45%)' }}
                    >
                      <FiPaperclip className="w-4 h-4" />
                    </Button>

                    <Textarea
                      ref={textareaRef}
                      placeholder={
                        showSampleData
                          ? 'Sample mode active - toggle off to chat'
                          : attachedFiles.some((f) => f.uploaded)
                          ? 'Add a message (optional) or press send to analyze files...'
                          : 'Type your message or attach a file...'
                      }
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isLoading || showSampleData}
                      rows={1}
                      className="flex-1 border-0 bg-transparent resize-none text-sm min-h-[36px] max-h-32 focus-visible:ring-0 focus-visible:ring-offset-0"
                      style={{ color: 'hsl(30 25% 18%)' }}
                    />
                    <Button
                      size="sm"
                      onClick={handleSend}
                      disabled={!canSend}
                      className="h-9 w-9 p-0 shrink-0 rounded-lg"
                      style={{
                        backgroundColor: canSend ? 'hsl(25 55% 40%)' : 'hsl(40 20% 88%)',
                        color: canSend ? 'hsl(40 30% 98%)' : 'hsl(30 15% 45%)',
                      }}
                    >
                      {isLoading ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiSend className="w-4 h-4" />}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 px-1">
                    <span className="text-[10px]" style={{ color: 'hsl(30 15% 45%)' }}>
                      Currently: <span className="font-medium" style={{ color: 'hsl(25 55% 40%)' }}>{getStageName(displayStage)}</span>
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] flex items-center gap-1" style={{ color: 'hsl(30 15% 45%)' }}>
                        <FiPaperclip className="w-2.5 h-2.5" />
                        PDF, DOC, TXT
                      </span>
                      <span className="text-[10px]" style={{ color: 'hsl(30 15% 45%)' }}>
                        Shift+Enter for new line
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Agent info bar */}
              <AgentInfoBar isActive={isLoading} />
            </main>

            {/* ─── Right Panel (PRD Preview) ─── */}
            {showPreview && (
              <aside className="hidden sm:flex w-72 lg:w-80 shrink-0">
                <PRDPreview
                  approvedSections={displayApproved}
                  currentStage={displayStage}
                  onClose={() => setShowPreview(false)}
                />
              </aside>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
