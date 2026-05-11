export interface TaskSubTask {
  id: number
  title: string
  status: string
  dueDate: string | null
  estimatedMinutes: number | null
  actualMinutes: number | null
}

export interface Task {
  id: number
  tenantId: number
  title: string
  description: string | null
  type: string | null
  category: string | null
  status: string
  dueDate: string | null
  completedAt: string | null
  estimatedMinutes: number | null
  actualMinutes: number | null
  isRecurring: boolean
  recurrenceRule: string | null
  assignedTo: { id: number; name: string; email: string } | null
  subTasks: TaskSubTask[]
  createdAt: string
  updatedAt: string
}

export interface ListTasksParams {
  page?: number
  pageSize?: number
  status?: string
  personId?: number
  companyId?: number
  assignedToId?: number
  topLevelOnly?: boolean
}
