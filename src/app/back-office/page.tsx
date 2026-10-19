import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth, readActor } from '@/server/auth';
import { roleHome } from '@/lib/back-office-access';

export default async function BackOfficeEntry() {
  const actor = await readActor(getAuth(), await headers());
  redirect(actor ? roleHome(actor.role) : '/login');
}
