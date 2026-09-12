import { useState, useEffect } from 'react';
import { apiRequest } from '../../../lib/api';
import { useToastStore } from '../../../stores/toastStore';
import { Users, Trash2, Building2, X } from 'lucide-react';
import { ConfirmModal } from '../../ui/ConfirmModal';

interface Contact {
  customer_id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  primary_email: string;
  position_title: string;
  created_at: string;
}

interface OrganizationContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  organization: { id: string; trade_name?: string; legal_name?: string } | null;
}

export default function OrganizationContactsModal({ isOpen, onClose, organization }: OrganizationContactsModalProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [contactToRemove, setContactToRemove] = useState<Contact | null>(null);
  const addToast = useToastStore((state) => state.addToast);

  // Mover fetchData para que sea accedida de manera segura, no usamos useCallback porque no hace falta
  // ya que se usa dentro del useEffect
  useEffect(() => {
    let active = true;
    const fetchContacts = async () => {
      if (!organization?.id) return;
      try {
        setIsLoading(true);
        const data = await apiRequest<Contact[]>(`/admin/organizations/${organization.id}/customers`);
        if (active) setContacts(data);
      } catch {
        addToast('Error al cargar contactos de la empresa', 'error');
      } finally {
        if (active) setIsLoading(false);
      }
    };

    if (isOpen && organization) {
      fetchContacts();
    }
    
    // Limpieza de efecto
    return () => {
      active = false;
      // Esto limpia la lista cuando el modal se cierra o se cambia de organizacion
      if (!isOpen) {
        setContacts([]);
      }
    };
  }, [isOpen, organization, addToast]);

  const handleRemove = async () => {
    if (!contactToRemove || !organization) return;
    try {
      await apiRequest(`/admin/organizations/${organization.id}/customers/${contactToRemove.customer_id}`, {
        method: 'DELETE'
      });
      addToast('Contacto desvinculado exitosamente', 'success');
      setContactToRemove(null);
      
      // Refetch
      setIsLoading(true);
      const data = await apiRequest<Contact[]>(`/admin/organizations/${organization.id}/customers`);
      setContacts(data);
      setIsLoading(false);
    } catch {
      addToast('Error al desvincular contacto', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm" onClick={onClose}>
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            
            <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white/90">Contactos Vinculados</h2>
                  <p className="text-sm text-white/40">Empresa: {organization?.trade_name || organization?.legal_name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[60vh] space-y-3">
              {isLoading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-white/50"></div>
                </div>
              ) : contacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Building2 className="mb-3 h-12 w-12 text-white/20" />
                  <p className="text-white/40">No hay contactos vinculados a esta empresa.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {contacts.map((contact) => (
                    <div key={contact.customer_id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white/90 truncate">
                          {contact.display_name || `${contact.first_name} ${contact.last_name}`}
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-xs text-white/40 truncate">
                          <span className="font-medium text-white/70">{contact.position_title || 'Sin cargo'}</span>
                          <span>•</span>
                          <span>{contact.primary_email}</span>
                        </p>
                      </div>
                      <div className="ml-4 flex-shrink-0">
                        <button
                          onClick={() => setContactToRemove(contact)}
                          className="rounded-lg p-2 text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                          title="Desvincular contacto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!contactToRemove}
        onCancel={() => setContactToRemove(null)}
        onConfirm={handleRemove}
        title="Desvincular Contacto"
        message={`¿Estás seguro que deseas desvincular a "${contactToRemove?.display_name || contactToRemove?.first_name}" de esta empresa?`}
        confirmText="Desvincular"
        type="danger"
      />
    </>
  );
}
