export type UserRole = 'admin' | 'social_media_manager' | 'content_creator' | 'graphic_social' | 'graphic_brand';
export type ProjectStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type NotificationType = 'task_assigned' | 'task_updated' | 'task_completed' | 'project_created' | 'post_created' | 'comment_added' | 'mention' | 'deadline_approaching' | 'ai_script_ready';
export type AiProvider = 'claude' | 'openai' | 'gemini';
export type ScriptType = 'social_post' | 'blog_article' | 'email_campaign' | 'ad_copy' | 'video_script' | 'brand_guidelines' | 'other';
export type PostCategory = 'announcement' | 'update' | 'idea' | 'question' | 'celebration';
export type ActivityAction = 'created' | 'updated' | 'deleted' | 'completed' | 'assigned' | 'commented' | 'status_changed';
export type ActivityEntity = 'client' | 'project' | 'task' | 'post' | 'ai_script';

export type EmployeeContractType = '6_mesi' | '12_mesi' | 'indeterminato';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  salary: number | null;
  iban: string | null;
  contract_type: EmployeeContractType | null;
  contract_start_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  logo_url: string | null;
  is_active: boolean;
  ragione_sociale: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  codice_sdi: string | null;
  pec: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  service_types: string | null;
  relationship_start: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  knowledge_base?: ClientKnowledgeBase;
}

export interface ClientSocialCredentials {
  id: string;
  client_id: string;
  instagram_username: string | null;
  instagram_password: string | null;
  facebook_username: string | null;
  facebook_password: string | null;
  tiktok_username: string | null;
  tiktok_password: string | null;
  other_platforms: { name: string; username: string; password: string }[] | null;
  created_at: string;
  updated_at: string;
}

export interface ClientOnboarding {
  id: string;
  client_id: string;
  contract_signed: boolean;
  logo_received: boolean;
  social_credentials: boolean;
  brand_guidelines_received: boolean;
  strategy_defined: boolean;
  first_meeting_done: boolean;
  social_accounts_access: boolean;
  content_plan_created: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientKnowledgeBase {
  id: string;
  client_id: string;
  strategy: string | null;
  objectives: string | null;
  target_audience: string | null;
  tone_of_voice: string | null;
  brand_guidelines: string | null;
  services: string | null;
  competitors: string | null;
  keywords: string | null;
  additional_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  client_id: string | null;
  status: ProjectStatus;
  color: string;
  deadline: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  client?: Client;
  members?: ProjectMember[];
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  added_at: string;
  profile?: Profile;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  project_id: string;
  assigned_to: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  deadline: string | null;
  estimated_hours: number | null;
  ai_generated: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  project?: Project;
  assignee?: Profile;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user?: Profile;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
}

export interface AiScript {
  id: string;
  title: string;
  prompt: string;
  result: string | null;
  script_type: ScriptType;
  provider: AiProvider | null;
  model: string | null;
  client_id: string | null;
  project_id: string | null;
  tokens_used: number | null;
  is_favorite: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  client?: Client;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  category: PostCategory;
  is_pinned: boolean;
  author_id: string;
  created_at: string;
  updated_at: string;
  author?: Profile;
  comments?: PostComment[];
  reactions?: PostReaction[];
  comment_count?: number;
}

export interface PostComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author?: Profile;
}

export interface PostReaction {
  id: string;
  post_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action: ActivityAction;
  entity_type: ActivityEntity;
  entity_id: string;
  entity_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  user?: Profile;
}

export interface TeamEfficiency {
  user_id: string;
  full_name: string;
  role: UserRole;
  tasks_assigned: number;
  tasks_completed: number;
  tasks_on_time: number;
  tasks_overdue: number;
  completion_rate: number;
  on_time_rate: number;
  avg_completion_hours: number;
}

export interface ProductivityTrend {
  period_start: string;
  tasks_completed: number;
  tasks_assigned: number;
}

export interface TeamOverviewStats {
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  avg_completion_rate: number;
  avg_on_time_rate: number;
}

export type ContractStatus = 'active' | 'completed' | 'cancelled';
export type PaymentTiming = 'inizio_mese' | 'fine_mese';

export interface ClientContract {
  id: string;
  client_id: string;
  monthly_fee: number;
  duration_months: 0 | 6 | 12;
  start_date: string;
  status: ContractStatus;
  payment_timing: PaymentTiming;
  attachment_url: string | null;
  attachment_name: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  payments?: ClientPayment[];
}

export interface ClientPayment {
  id: string;
  contract_id: string;
  month_index: number;
  due_date: string;
  amount: number;
  is_paid: boolean;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientFinancialSummary {
  contract_id: string;
  monthly_fee: number;
  duration_months: number;
  start_date: string;
  contract_status: ContractStatus;
  total_value: number;
  total_paid: number;
  remaining: number;
  months_paid: number;
  months_remaining: number;
}

export interface PaymentLog {
  id: string;
  payment_id: string;
  contract_id: string;
  client_id: string;
  action: 'paid' | 'unpaid';
  amount: number;
  month_index: number;
  due_date: string;
  performed_by: string;
  performed_at: string;
  performer?: Profile;
}

export interface CashflowMonthly {
  month_date: string;
  expected: number;
  received: number;
  pending: number;
  num_clients: number;
}

export interface CashflowSummary {
  total_expected: number;
  total_received: number;
  total_pending: number;
  active_contracts: number;
  active_clients: number;
  avg_monthly_revenue: number;
}

export interface ProfitLossSummary {
  total_revenue: number;
  total_received: number;
  total_pending_revenue: number;
  monthly_salary_cost: number;
  total_salary_cost_period: number;
  gross_margin: number;
  gross_margin_pct: number;
  net_margin: number;
  net_margin_pct: number;
  num_months: number;
}

export interface EmployeeExpense {
  id: string;
  full_name: string;
  role: string;
  salary: number;
  contract_type: string;
}

export interface MonthlyExpenses {
  total_monthly_salaries: number;
  num_employees: number;
  employees_detail: EmployeeExpense[];
}

export interface RevenuePerClient {
  client_id: string;
  client_name: string;
  company: string | null;
  monthly_fee: number;
  total_expected: number;
  total_paid: number;
  total_pending: number;
  months_paid: number;
  months_total: number;
}

// === PRESENZE ===
export type AttendanceStatus = 'working' | 'lunch_break' | 'completed' | 'absent';

export interface AttendanceRecord {
  id: string;
  user_id: string;
  date: string;
  clock_in: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
  clock_out: string | null;
  status: AttendanceStatus;
  total_hours: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamAttendanceToday {
  user_id: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  status: AttendanceStatus;
  clock_in: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
  clock_out: string | null;
}

export interface AttendanceWeeklyRow {
  user_id: string;
  full_name: string;
  role: UserRole;
  day_date: string;
  clock_in: string | null;
  clock_out: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
  total_hours: number;
  status: AttendanceStatus;
}

export interface AttendanceMonthlyReport {
  user_id: string;
  full_name: string;
  role: UserRole;
  days_worked: number;
  total_hours: number;
  avg_hours_per_day: number;
  late_arrivals: number;
  early_departures: number;
}

// === CHAT ===
export type ChannelType = 'team' | 'direct' | 'project' | 'group';

export interface ChatChannel {
  id: string;
  name: string;
  type: ChannelType;
  project_id: string | null;
  created_by: string | null;
  created_at: string;
  members?: ChatChannelMember[];
  last_message?: ChatMessage;
}

export interface ChatChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  joined_at: string;
  profile?: Profile;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: Profile;
}

// === NOTE SVILUPPATORE ===
export type DevNoteCategory = 'bug' | 'feature_request' | 'improvement';
export type DevNoteStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface DeveloperNote {
  id: string;
  title: string;
  description: string;
  category: DevNoteCategory;
  priority: TaskPriority;
  status: DevNoteStatus;
  screenshot_url: string | null;
  resolved_task_id: string | null;
  author_id: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  author?: Profile;
  resolver?: Profile;
  resolved_task?: Task;
}

// === CALENDARIO ===
export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  all_day: boolean;
  color: string | null;
  ical_uid: string | null;
  assigned_to: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  creator?: Profile;
}

export interface CalendarSyncConfig {
  id: string;
  user_id: string;
  caldav_url: string;
  caldav_username: string | null;
  caldav_password: string | null;
  calendar_path: string | null;
  last_synced_at: string | null;
  sync_status: 'active' | 'paused' | 'error';
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}
