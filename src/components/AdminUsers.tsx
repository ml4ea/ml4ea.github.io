import { ChevronLeft, ChevronRight, GraduationCap, Search, ShieldCheck, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

interface DirectoryUser {
  user_id: string;
  email: string;
  display_name: string | null;
  account_created_at: string;
  email_confirmed_at: string;
  last_sign_in_at: string;
  instructor_status: 'pending' | 'approved' | 'rejected' | null;
  institution: string | null;
  position_title: string | null;
  instructor_reviewed_at: string | null;
  roles: string[];
  manual_download_count: number;
  last_manual_download_issued_at: string | null;
  total_count: number;
}

type Scope = 'signed_in' | 'instructors';

const PAGE_SIZE = 50;

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

export default function AdminUsers() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [scope, setScope] = useState<Scope>('signed_in');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [total, setTotal] = useState(0);
  const [checkingAccess, setCheckingAccess] = useState(isSupabaseConfigured);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const checkAccess = async (activeSession: Session | null) => {
      setSession(activeSession);
      setUsers([]);
      setTotal(0);
      if (!activeSession) {
        setIsAdmin(false);
        setCheckingAccess(false);
        return;
      }

      setCheckingAccess(true);
      const { data, error: accessError } = await supabase.rpc('is_portal_admin');
      setIsAdmin(Boolean(data));
      setError(accessError?.message ?? (!data ? 'Portal administrator access is required.' : ''));
      setCheckingAccess(false);
    };

    supabase.auth.getSession().then(({ data }) => void checkAccess(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => void checkAccess(nextSession), 0);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !isAdmin) return;

    let current = true;
    const load = async () => {
      setLoading(true);
      setError('');
      const { data, error: directoryError } = await supabase.rpc('get_portal_user_directory', {
        p_scope: scope,
        p_search: search || null,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (!current) return;
      if (directoryError) {
        setUsers([]);
        setTotal(0);
        setError(directoryError.message);
      } else {
        const nextUsers = (data ?? []) as DirectoryUser[];
        setUsers(nextUsers);
        setTotal(nextUsers[0]?.total_count ?? 0);
      }
      setLoading(false);
    };
    void load();
    return () => { current = false; };
  }, [isAdmin, page, scope, search]);

  if (!isSupabaseConfigured) return <p className="account-loading">Supabase is not configured.</p>;
  if (checkingAccess) return <p className="account-loading" aria-live="polite">Checking administrator access...</p>;
  if (!session) return <div className="account-state"><ShieldCheck aria-hidden="true" size={28} /><div><h2>Administrator sign-in required.</h2><p>Sign in with the owner or delegated administrator account.</p><a className="button button-primary" href="/account?next=/admin/users/">Sign in</a></div></div>;
  if (!isAdmin) return <div className="account-state account-unconfigured"><ShieldCheck aria-hidden="true" size={28} /><div><h2>This account is not a portal administrator.</h2><p>The account directory is restricted to the owner and delegated administrator.</p>{error && <p className="form-message form-error" role="alert">{error}</p>}</div></div>;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return <div className="admin-user-directory">
    <div className="admin-user-toolbar">
      <div className="admin-user-scopes" aria-label="User directory view">
        <button className={scope === 'signed_in' ? 'is-current' : ''} type="button" aria-pressed={scope === 'signed_in'} onClick={() => { setScope('signed_in'); setPage(0); }}>
          <UsersRound aria-hidden="true" size={18} /> Signed-in users
        </button>
        <button className={scope === 'instructors' ? 'is-current' : ''} type="button" aria-pressed={scope === 'instructors'} onClick={() => { setScope('instructors'); setPage(0); }}>
          <GraduationCap aria-hidden="true" size={18} /> Approved instructors
        </button>
      </div>
      <label className="admin-user-search">
        <span>Search accounts</span>
        <div><Search aria-hidden="true" size={18} /><input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Email, name, institution, or position" /></div>
      </label>
    </div>

    <div className="catalog-status admin-user-status">
      <p>{loading ? 'Loading accounts...' : `${total} ${scope === 'instructors' ? 'approved instructors' : total === 1 ? 'signed-in user' : 'signed-in users'}`}</p>
      <a className="text-link" href="/admin/">Administrator dashboard</a>
    </div>

    {!loading && users.length === 0 ? <div className="admin-empty"><UsersRound aria-hidden="true" size={27} /><div><h2>No matching accounts.</h2><p>Try another search or directory view.</p></div></div> : (
      <div className="admin-user-table-wrap" aria-busy={loading}>
        <table className="admin-user-table">
          <thead><tr><th>User</th><th>Portal roles</th><th>Instructor review</th><th>Manual PDF</th><th>Last sign-in</th><th>Account created</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.user_id}>
                <td><strong>{user.email}</strong>{user.display_name && <small>{user.display_name}</small>}</td>
                <td><span className="admin-user-roles">{user.roles.length > 0 ? user.roles.join(' · ') : 'Participant'}</span></td>
                <td>
                  <span className={`admin-user-review is-${user.instructor_status ?? 'none'}`}>{user.instructor_status ?? 'No request'}</span>
                  {user.institution && <small>{[user.position_title, user.institution].filter(Boolean).join(' · ')}</small>}
                </td>
                <td>
                  {user.manual_download_count > 0 && user.last_manual_download_issued_at ? <>
                    <span className="admin-user-download is-issued">Download issued</span>
                    <small>{user.manual_download_count} {user.manual_download_count === 1 ? 'time' : 'times'} · latest {formatDate(user.last_manual_download_issued_at)}</small>
                  </> : <span className="admin-user-download">None issued</span>}
                </td>
                <td><time dateTime={user.last_sign_in_at}>{formatDate(user.last_sign_in_at)}</time></td>
                <td><time dateTime={user.account_created_at}>{formatDate(user.account_created_at)}</time></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    {pageCount > 1 && <nav className="admin-user-pagination" aria-label="User directory pages">
      <button className="button button-secondary" type="button" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft aria-hidden="true" size={17} /> Previous</button>
      <span>Page {page + 1} of {pageCount}</span>
      <button className="button button-secondary" type="button" disabled={page + 1 >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight aria-hidden="true" size={17} /></button>
    </nav>}

    {error && <p className="form-message form-error" role="alert">{error}</p>}
  </div>;
}
