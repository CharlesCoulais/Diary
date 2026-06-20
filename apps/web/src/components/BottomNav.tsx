import { NavLink, useNavigate } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { trpc } from '../lib/trpc';
import { useBottomNavHeight } from '../hooks/useBottomNavHeight';
import { useFilToReplyCount } from '../lib/filActivity';

function PenIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function FilIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function NavItem({
  to,
  label,
  icon,
  end,
  count,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
  count?: number;
}) {
  return (
    <NavLink to={to} end={end} className="flex-1 min-w-0 flex items-center justify-center">
      {({ isActive }) => (
        <div
          className={
            'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl font-medium ' +
            'transition-all duration-200 ' +
            (isActive ? 'text-accent' : 'text-text-muted hover:text-text-primary')
          }
        >
          <span className="relative">
            {icon}
            {count != null && count > 0 && (
              <span
                aria-hidden
                className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-accent text-bg-elevated text-[10px] font-bold flex items-center justify-center leading-none ring-2 ring-bg-elevated"
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </span>
          <span className="text-[11px] leading-tight tracking-wide">
            {label}
            {count != null && count > 0 && (
              <span className="sr-only"> — {count} à répondre</span>
            )}
          </span>
        </div>
      )}
    </NavLink>
  );
}

function NewEntryFAB() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 min-w-0 flex items-center justify-center">
      <button
        type="button"
        onClick={() => navigate('/?create=1')}
        aria-label="Nouvelle note"
        className="w-12 h-12 rounded-full bg-accent text-bg-primary flex items-center justify-center shadow-md hover:opacity-90 active:scale-95 transition-all -mt-5"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}

function NewRequestFAB() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 min-w-0 flex items-center justify-center">
      <button
        type="button"
        onClick={() => navigate('/demandes?create=1')}
        aria-label="Nouvelle demande"
        className="w-12 h-12 rounded-full bg-accent text-bg-primary flex items-center justify-center shadow-md hover:opacity-90 active:scale-95 transition-all -mt-5"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}

function TodayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

/** Barre de navigation mobile pour les guests. */
export function GuestBottomNav() {
  const { data: me } = trpc.auth.me.useQuery();
  const isConfidant = me?.guestAccess === 'CONFIDANT';
  const navRef = useBottomNavHeight<HTMLElement>();
  const filCount = useFilToReplyCount();

  return (
    <nav ref={navRef} className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-bg-elevated border-t border-text-muted/10 safe-bottom">
      <div className="h-14 sm:h-16 flex items-center max-w-2xl mx-auto px-2">
        <NavItem to="/aujourd-hui" end label="Aujourd'hui" icon={<TodayIcon />} />
        <NavItem to="/" end label="Diary" icon={<ListIcon />} />
        {isConfidant && <NewRequestFAB />}
        <NavItem to="/fil" label="Fil" icon={<FilIcon />} count={filCount} />
        <div className="flex-1 min-w-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-0.5 px-2 py-1.5 text-text-muted">
            <NotificationBell dropUp />
            <span className="text-[11px] leading-tight tracking-wide">Notifs</span>
          </div>
        </div>
      </div>
    </nav>
  );
}

export function BottomNav() {
  const navRef = useBottomNavHeight<HTMLElement>();
  const filCount = useFilToReplyCount();
  return (
    <nav ref={navRef} className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-bg-elevated border-t border-text-muted/10 safe-bottom">
      <div className="h-14 sm:h-16 flex items-center max-w-2xl mx-auto px-2">
        <NavItem to="/" end label="Aujourd'hui" icon={<PenIcon />} />
        <NavItem to="/timeline" label="Diary" icon={<ListIcon />} />
        <NewEntryFAB />
        <NavItem to="/fil" label="Fil" icon={<FilIcon />} count={filCount} />
        <div className="flex-1 min-w-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-0.5 px-2 py-1.5 text-text-muted">
            <NotificationBell dropUp />
            <span className="text-[11px] leading-tight tracking-wide">Notifs</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
