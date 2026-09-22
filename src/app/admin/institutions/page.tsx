import { Metadata } from 'next';
import { InstitutionsManagementTab } from '@/components/admin/tabs/InstitutionsManagementTab';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Institutions Management | Super Admin Console',
  description: 'Manage platform colleges, multi-tenant portals, and institution lifecycle.',
};

export default function AdminInstitutionsPage() {
  return <InstitutionsManagementTab />;
}
