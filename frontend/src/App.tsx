import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'

const DashboardPage    = lazy(() => import('@/pages/DashboardPage'))
const CompaniesPage    = lazy(() => import('@/pages/CompaniesPage'))
const CompanyDetailPage = lazy(() => import('@/pages/CompanyDetailPage'))
const PersonsPage      = lazy(() => import('@/pages/PersonsPage'))
const PersonDetailPage = lazy(() => import('@/pages/PersonDetailPage'))
const TasksPage        = lazy(() => import('@/pages/TasksPage'))
const DealsPage        = lazy(() => import('@/pages/DealsPage'))
const LeadsPage        = lazy(() => import('@/pages/LeadsPage'))
const InvoicesPage     = lazy(() => import('@/pages/InvoicesPage'))
const EquipmentPage    = lazy(() => import('@/pages/EquipmentPage'))
const AiQueryPage      = lazy(() => import('@/pages/AiQueryPage'))
const AiBriefingPage   = lazy(() => import('@/pages/AiBriefingPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/companies" element={<CompaniesPage />} />
        <Route path="/companies/:id" element={<CompanyDetailPage />} />
        <Route path="/persons" element={<PersonsPage />} />
        <Route path="/persons/:id" element={<PersonDetailPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/deals" element={<DealsPage />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/equipment" element={<EquipmentPage />} />
        <Route path="/ai/query" element={<AiQueryPage />} />
        <Route path="/ai/briefing" element={<AiBriefingPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <AppRoutes />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
