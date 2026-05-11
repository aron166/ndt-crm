import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Users, Globe, MapPin } from 'lucide-react'
import { useCompany } from '@/hooks/useCompany'
import { useCompanyContacts } from '@/hooks/useCompanyContacts'
import { PipelineStatusBadge } from '@/components/PipelineStatusBadge'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Contact } from '@/types/contact'

// ─── Tab types ────────────────────────────────────────────────

type TabId = 'overview' | 'contacts' | 'deals' | 'tasks' | 'interactions' | 'invoices'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',      label: 'Áttekintés' },
  { id: 'contacts',      label: 'Kapcsolattartók' },
  { id: 'deals',         label: 'Deals' },
  { id: 'tasks',         label: 'Feladatok' },
  { id: 'interactions',  label: 'Interakciók' },
  { id: 'invoices',      label: 'Számlák' },
]

// ─── Detail row helper ─────────────────────────────────────────

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="w-44 shrink-0 text-sm text-slate-500">{label}</span>
      <span className="text-sm text-slate-800">{children}</span>
    </div>
  )
}

function EmptyValue() {
  return <span className="text-slate-400">—</span>
}

// ─── Tabs ─────────────────────────────────────────────────────

function OverviewTab({ companyId }: { companyId: number }) {
  const { data: company } = useCompany(companyId)
  if (!company) return null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Basic info */}
      <div className="bg-white border border-slate-200 rounded-md shadow-card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Alapadatok</h2>
        <DetailRow label="Cégnév">{company.name}</DetailRow>
        <DetailRow label="Adószám">
          {company.vatNumber
            ? <span className="font-mono">{company.vatNumber}</span>
            : <EmptyValue />}
        </DetailRow>
        <DetailRow label="Belső kód">
          {company.shortCode ?? <EmptyValue />}
        </DetailRow>
        <DetailRow label="Típus">
          {company.accountType ?? <EmptyValue />}
        </DetailRow>
        <DetailRow label="Státusz">
          {company.status ?? <EmptyValue />}
        </DetailRow>
        <DetailRow label="Iparág (TEÁOR)">
          {company.industryCode ?? <EmptyValue />}
        </DetailRow>
        <DetailRow label="Pipeline">
          <PipelineStatusBadge status={company.pipelineStatus} />
        </DetailRow>
      </div>

      {/* Address */}
      <div className="bg-white border border-slate-200 rounded-md shadow-card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Cím</h2>
        <DetailRow label="Ország">{company.country ?? <EmptyValue />}</DetailRow>
        <DetailRow label="Megye">{company.county ?? <EmptyValue />}</DetailRow>
        <DetailRow label="Város">{company.city ?? <EmptyValue />}</DetailRow>
        <DetailRow label="Irányítószám">{company.zipCode ?? <EmptyValue />}</DetailRow>
        <DetailRow label="Cím">{company.address ?? <EmptyValue />}</DetailRow>
        <DetailRow label="Weboldal">
          {company.website
            ? <a href={company.website} target="_blank" rel="noreferrer"
                 className="text-indigo-700 hover:underline inline-flex items-center gap-1">
                <Globe size={12} />
                {company.website}
              </a>
            : <EmptyValue />}
        </DetailRow>
      </div>

      {/* Activity */}
      <div className="bg-white border border-slate-200 rounded-md shadow-card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Aktivitás</h2>
        <DetailRow label="Utolsó kapcsolat dátuma">
          {company.lastInteractionDate ? formatDate(company.lastInteractionDate) : <EmptyValue />}
        </DetailRow>
        <DetailRow label="Utolsó kapcsolat – ki">
          {company.lastInteractionOwner ?? <EmptyValue />}
        </DetailRow>
        <DetailRow label="Létrehozva">{formatDate(company.createdAt)}</DetailRow>
        <DetailRow label="Módosítva">{formatDate(company.updatedAt)}</DetailRow>
      </div>
    </div>
  )
}

function ContactRow({ contact }: { contact: Contact }) {
  const fullName = `${contact.person.lastName} ${contact.person.firstName}`
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
      <td className="px-4 py-3 text-sm">
        <Link
          to={`/persons/${contact.person.id}`}
          className="font-medium text-slate-900 hover:text-indigo-700 transition-colors"
        >
          {fullName}
        </Link>
        {contact.isPrimary && (
          <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
            Elsődleges
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">{contact.role ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{contact.email ?? contact.person.email ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{contact.phone ?? contact.person.phone ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-slate-500">
        {contact.startedAt ? formatDate(contact.startedAt) : '—'}
      </td>
    </tr>
  )
}

function ContactsTab({ companyId }: { companyId: number }) {
  const { data: contacts, isLoading } = useCompanyContacts(companyId)

  return (
    <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {['Név', 'Beosztás', 'E-mail', 'Telefon', 'Kezdés'].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-100">
                {Array.from({ length: 5 }).map((_, j) => (
                  <td key={j} className="px-4 py-3">
                    <div className="h-4 bg-slate-100 rounded animate-pulse" />
                  </td>
                ))}
              </tr>
            ))
          ) : !contacts || contacts.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Users size={40} className="text-slate-300 mb-3" />
                  <p className="text-base font-medium text-slate-600">Nincs aktív kapcsolattartó</p>
                  <p className="text-sm text-slate-400 mt-1">Adjon hozzá egy személyt ehhez a céghez.</p>
                </div>
              </td>
            </tr>
          ) : (
            contacts.map((c) => <ContactRow key={c.id} contact={c} />)
          )}
        </tbody>
      </table>
    </div>
  )
}

function ComingSoonTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-base font-medium text-slate-600">{label}</p>
      <p className="text-sm text-slate-400 mt-1">Hamarosan elérhető.</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const companyId = Number(id)
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const { data: company, isLoading, isError } = useCompany(companyId)

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-base font-medium text-slate-600">A cég nem található.</p>
        <Link to="/companies" className="text-sm text-indigo-700 hover:underline mt-2">
          Vissza a cégekhez
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Back */}
      <Link
        to="/companies"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
      >
        <ChevronLeft size={14} />
        Cégek
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          {isLoading ? (
            <div className="h-7 w-64 bg-slate-100 rounded animate-pulse mb-2" />
          ) : (
            <h1 className="text-2xl font-bold text-slate-900">{company?.name}</h1>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            {company?.city && (
              <span className="flex items-center gap-1 text-sm text-slate-500">
                <MapPin size={12} />
                {company.city}
              </span>
            )}
            {company?.vatNumber && (
              <span className="font-mono text-sm text-slate-500">{company.vatNumber}</span>
            )}
            {company?.pipelineStatus && (
              <PipelineStatusBadge status={company.pipelineStatus} />
            )}
          </div>
        </div>
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
      {activeTab === 'overview'     && <OverviewTab companyId={companyId} />}
      {activeTab === 'contacts'     && <ContactsTab companyId={companyId} />}
      {activeTab === 'deals'        && <ComingSoonTab label="Deals — hamarosan" />}
      {activeTab === 'tasks'        && <ComingSoonTab label="Feladatok — hamarosan" />}
      {activeTab === 'interactions' && <ComingSoonTab label="Interakciók — hamarosan" />}
      {activeTab === 'invoices'     && <ComingSoonTab label="Számlák — hamarosan" />}
    </div>
  )
}
