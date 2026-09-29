export interface StatusHistoryRecord {
  timestamp: string;
  user_name: string | null;
  user_email: string | null;
  old_status: string | null;
  old_status_name: string | null;
  new_status: string;
  new_status_name: string;
  reason?: string | null;
}

export interface StatusCatalogItem {
  id: string;
  code: string;
  name: string;
  isTerminal?: boolean;
}
