import React from 'react';
import { RefreshCw } from 'lucide-react';
import type { StatusHistoryRecord } from '../../types/status';
import Timeline from '../ui/Timeline';

type Props = {
  records: StatusHistoryRecord[];
  loading?: boolean;
};

const StatusHistoryTimeline: React.FC<Props> = ({ records, loading = false }) => (
  <Timeline
    heading="Historial de Estados"
    loading={loading}
    emptyMessage="No hay cambios de estado registrados."
    items={records.map((record) => ({
      date: record.timestamp,
      icon: <RefreshCw className="h-4 w-4" />,
      title: (
        <div className="flex flex-col gap-3">
          <div>
            <span className="font-medium text-white/90">{record.user_name || record.user_email || 'Sistema'}</span>
            {' cambió el estado de '}
            <span className="text-white/90">{record.old_status_name || record.old_status || 'Sin estado'}</span>
            {' a '}
            <span className="text-white/90">{record.new_status_name || record.new_status}</span>.
          </div>
          {record.reason && (
            <div className="mt-1 border-l-2 border-[#06CFD6]/30 pl-3">
              <p className="text-[10px] uppercase tracking-wider text-[#06CFD6] mb-0.5 font-semibold">Motivo del Cambio</p>
              <p className="text-xs text-white/70 italic break-words whitespace-pre-wrap max-w-[280px]">"{record.reason}"</p>
            </div>
          )}
        </div>
      ),
    }))}
  />
);

export default StatusHistoryTimeline;
