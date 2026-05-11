import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ChevronLeft, Mail, Phone, Link2, Building2,
  Calendar, CheckSquare, MessageSquare, Phone as PhoneIcon,
  AtSign, FileText, MapPin, Repeat,
} from 'lucide-react'
import { usePerson } from '@/hooks/usePerson'
import { usePersonContacts } from '@/hooks/usePersonContacts'
import { usePersonInteractions } from '@/hooks/usePersonInteractions'
import { usePersonTasks } from '@/hooks/usePersonTasks'
import { Pagination } from '@/components/Pagination'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import type { Contact } from '@/types/contact'
import type { Interaction } from '@/types/interaction'
import type { Task } from '@/types/task'

// ─── Constants ────────────────────────────────────────────────

type TabId = 'employment' | 'interactions' | 'tasks'

const TABS: { id: TabId; label: string }[] = [
  { id: 'employment',    label: 'Karrier' },
  { id: 'interactions',  label: 'Interakciók' },
  { id: 'tasks',         label: 'Feladatok' },
]

const INTERACTION_TYPE_LABEL: Record<string, string> = {
  call:       'Hívás',
  email:      'E-mail',
  meeting:    'Találkozó',
  note:       'Feljegyzés',
  site_visit: 'Helyszíni látogatás',
}

const INTERACTION_TYPE_ICON: Record<string, React.ElementType> = {
  call:       PhoneIcon,
  email:      AtSign,
  meeting:    Calendar,
  note:       FileText,
  site_visit: MapPin,
}

const TASK_STATUS_LABEL: Record<string, string> = {
  not_started: 'Nem kezdett',
  in_progress: 'Folyamatban',
  done:        'Kész',
  cancelled:   'Törölve',
}

const TASK_STATUS_STYLE: Record<string, string> = {
  not_started: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-50 text-blue-700',
  done:        'bg-emerald-50 text-emerald-700',
  cancelled:   'bg-red-50 text-red-500',
}

// ─── Employment history tab ────────────────────────────────────

function EmploymentTab({ contacts, isLoading }: { contacts: Contact[] | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-md p-5">
            <div className="h-4 w-48 bg-slate-100 rounded animate-pulse mb-2" />
            <div className="h-3 w-32 bg-slate-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  if (!contacts || contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Building2 size={40} className="text-slate-300 mb-3" />
        <p className="text-base font-medium text-slate-600">Nincs rögzített munkahely</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {contacts.map((contact) => {
        const isCurrent = contact.endedAt === null
        return (
          <div
            key={contact.id}
            className={cn(
              'bg-white border rounded-md p-5 shadow-card',
              isCurrent ? 'border-indigo-200' : 'border-slate-200',
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to={`/companies/${contact.company.id}`}
                    className="text-base font-semibold text-slate-900 hover:text-indigo-700 transition-colors"
                  >
                    {contact.company.name}
                  </Link>
                  {isCurrent && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                      Jelenlegi
                    </span>
                  )}
                  {contact.isPrimary && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      Elsődleges
                    </span>
                  )}
                </div>
                {contact.role && (
                  <p className="text-sm text-slate-600 mt-0.5">{contact.role}</p>
                )}
                {(contact.email || contact.phone) && (
                  <div className="flex items-center gap-4 mt-1.5">
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="text-sm text-slate-500 hover:text-indigo-700 transition-colors flex items-center gap-1">
                        <Mail size={12} /> {contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className="text-sm text-slate-500 hover:text-indigo-700 transition-colors flex items-center gap-1">
                        <Phone size={12} /> {contact.phone}
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-slate-500">
                  {contact.startedAt ? formatDate(contact.startedAt) : '?'}
                  {' – '}
                  {isCurrent ? 'jelen' : contact.endedAt ? formatDate(contact.endedAt) : '?'}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Interactions tab ──────────────────────────────────────────

function InteractionRow({ interaction }: { interaction: Interaction }) {
  const typeKey = interaction.type ?? 'note'
  const Icon = INTERACTION_TYPE_ICON[typeKey] ?? FileText
  const typeLabel = INTERACTION_TYPE_LABEL[typeKey] ?? typeKey

  return (
    <div className="flex gap-4 py-4 border-b border-slate-100 last:border-0">
      <div className="mt-0.5 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
        <Icon size={14} className="text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-800">{typeLabel}</span>
          {interaction.direction && (
            <span className="text-xs text-slate-400">
              {interaction.direction === 'inbound' ? '← Bejövő' : '→ Kimenő'}
            </span>
          )}
          {interaction.outcome && (
            <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
              {interaction.outcome}
            </span>
          )}
        </div>
        {interaction.notes && (
          <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{interaction.notes}</p>
        )}
        <p className="text-xs text-slate-400 mt-1.5">
          {formatDateTime(interaction.occurredAt)}
          {interaction.user && ` · ${interaction.user.name}`}
        </p>
      </div>
    </div>
  )
}

function InteractionsTab({ personId }: { personId: number }) {
  const [page, setPage] = useState(1)
  const { data, isLoading } = usePersonInteractions(personId, page)

  if (isLoading && !data) {
    return (
      <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
              <div className="h-3 w-64 bg-slate-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <MessageSquare size={40} className="text-slate-300 mb-3" />
        <p className="text-base font-medium text-slate-600">Nincs rögzített interakció</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-md px-5">
      {data.data.map((i) => <InteractionRow key={i.id} interaction={i} />)}
      {data.meta.pageCount > 1 && (
        <Pagination meta={data.meta} onPageChange={setPage} />
      )}
    </div>
  )
}

// ─── Tasks tab ─────────────────────────────────────────────────

function TaskRow({ task }: { task: Task }) {
  const statusStyle = TASK_STATUS_STYLE[task.status] ?? 'bg-slate-100 text-slate-600'
  const statusLabel = TASK_STATUS_LABEL[task.status] ?? task.status
  const isOverdue = task.dueDate && task.status !== 'done' && task.status !== 'cancelled'
    && new Date(task.dueDate) < new Date()

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
      <td className="px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          {task.isRecurring && <Repeat size={12} className="text-slate-400 shrink-0" />}
          <span className="font-medium text-slate-900">{task.title}</span>
          {task.subTasks.length > 0 && (
            <span className="text-xs text-slate-400">+{task.subTasks.length}</span>
          )}
        </div>
        {task.description && (
          <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{task.description}</p>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', statusStyle)}>
          {statusLabel}
        </span>
      </td>
      <td className="px-4 py-3 text-sm">
        {task.dueDate
          ? <span className={cn(isOverdue ? 'text-red-600 font-medium' : 'text-slate-500')}>{formatDate(task.dueDate)}</span>
          : <span className="text-slate-400">—</span>
        }
      </td>
      <td className="px-4 py-3 text-sm text-slate-500">
        {task.assignedTo?.name ?? '—'}
      </td>
    </tr>
  )
}

function TasksTab({ personId }: { personId: number }) {
  const [page, setPage] = useState(1)
  const { data, isLoading } = usePersonTasks(personId, page)

  return (
    <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {['Feladat', 'Státusz', 'Határidő', 'Felelős'].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-100">
                {[1,2,3,4].map((j) => (
                  <td key={j} className="px-4 py-3">
                    <div className="h-4 bg-slate-100 rounded animate-pulse" />
                  </td>
                ))}
              </tr>
            ))
          ) : !data || data.data.length === 0 ? (
            <tr>
              <td colSpan={4}>
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <CheckSquare size={40} className="text-slate-300 mb-3" />
                  <p className="text-base font-medium text-slate-600">Nincs feladat</p>
                </div>
              </td>
            </tr>
          ) : (
            data.data.map((t) => <TaskRow key={t.id} task={t} />)
          )}
        </tbody>
      </table>
      {data && data.meta.pageCount > 1 && (
        <Pagination meta={data.meta} onPageChange={setPage} />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function PersonDetailPage() {
  const { id } = useParams<{ id: string }>()
  const personId = Number(id)
  const [activeTab, setActiveTab] = useState<TabId>('employment')

  const { data: person, isLoading, isError } = usePerson(personId)
  const { data: contacts } = usePersonContacts(personId)

  const currentContact = contacts?.find((c) => c.endedAt === null)

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-base font-medium text-slate-600">A személy nem található.</p>
        <Link to="/persons" className="text-sm text-indigo-700 hover:underline mt-2">
          Vissza a személyekhez
        </Link>
      </div>
    )
  }

  const initials = person
    ? `${person.lastName.slice(0, 1)}${person.firstName.slice(0, 1)}`
    : '??'

  return (
    <div>
      {/* Back */}
      <Link
        to="/persons"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
      >
        <ChevronLeft size={14} />
        Személyek
      </Link>

      {/* Header card */}
      <div className="bg-white border border-slate-200 rounded-md shadow-card p-6 mb-5">
        {isLoading ? (
          <div className="flex gap-4">
            <div className="w-14 h-14 rounded-full bg-slate-100 animate-pulse shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-6 w-48 bg-slate-100 rounded animate-pulse" />
              <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
            </div>
          </div>
        ) : person ? (
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full bg-indigo-700 flex items-center justify-center text-white text-lg font-bold shrink-0">
              {initials}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-slate-900">
                {person.lastName} {person.firstName}
              </h1>

              {currentContact && (
                <p className="text-sm text-slate-600 mt-0.5">
                  {currentContact.role && <span>{currentContact.role} · </span>}
                  <Link
                    to={`/companies/${currentContact.company.id}`}
                    className="text-indigo-700 hover:underline"
                  >
                    {currentContact.company.name}
                  </Link>
                </p>
              )}

              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3">
                {person.email && (
                  <a
                    href={`mailto:${person.email}`}
                    className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-700 transition-colors"
                  >
                    <Mail size={13} /> {person.email}
                  </a>
                )}
                {person.phone && (
                  <a
                    href={`tel:${person.phone}`}
                    className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-700 transition-colors"
                  >
                    <Phone size={13} /> {person.phone}
                  </a>
                )}
                {person.linkedinUrl && (
                  <a
                    href={person.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-700 transition-colors"
                  >
                    <Link2 size={13} /> LinkedIn
                  </a>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-5">
        <nav className="-mb-px flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'employment' && (
        <EmploymentTab contacts={contacts} isLoading={!contacts && !isError} />
      )}
      {activeTab === 'interactions' && <InteractionsTab personId={personId} />}
      {activeTab === 'tasks' && <TasksTab personId={personId} />}
    </div>
  )
}
