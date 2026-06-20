import { lazy, Suspense, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOnline } from './lib/useOnline';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { trpc, trpcClient } from './lib/trpc';
// Pages d'auth chargées en eager (point d'entrée + small)
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';
// Home/GuestHome chargés en eager : la racine "/" doit s'afficher instantanément
import { HomePage } from './pages/Home';
import { GuestHome } from './pages/GuestHome';
// Tout le reste en lazy : un chunk par page, chargé à la demande
const TimelinePage = lazy(() => import('./pages/Timeline').then((m) => ({ default: m.TimelinePage })));
const TasksPage = lazy(() => import('./pages/Tasks').then((m) => ({ default: m.TasksPage })));
const CollectionPage = lazy(() => import('./pages/Collection').then((m) => ({ default: m.CollectionPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));
const StatsPage = lazy(() => import('./pages/Stats').then((m) => ({ default: m.StatsPage })));
const GuestSettingsPage = lazy(() => import('./pages/GuestSettings').then((m) => ({ default: m.GuestSettingsPage })));
const CommentsActivityPage = lazy(() => import('./pages/CommentsActivity').then((m) => ({ default: m.CommentsActivityPage })));
const DraftsPage = lazy(() => import('./pages/Drafts').then((m) => ({ default: m.DraftsPage })));
const CalendarPage = lazy(() => import('./pages/Calendar').then((m) => ({ default: m.CalendarPage })));
const BarometrePage = lazy(() => import('./pages/Barometre').then((m) => ({ default: m.BarometrePage })));
const AgendaPage = lazy(() => import('./pages/Agenda').then((m) => ({ default: m.AgendaPage })));
const BudgetPage = lazy(() => import('./pages/Budget').then((m) => ({ default: m.BudgetPage })));
const ContactsPage = lazy(() => import('./pages/Contacts').then((m) => ({ default: m.ContactsPage })));
const AcceptInvitationPage = lazy(() => import('./pages/AcceptInvitation').then((m) => ({ default: m.AcceptInvitationPage })));
const ApiDocsPage = lazy(() => import('./pages/ApiDocs').then((m) => ({ default: m.ApiDocsPage })));
const LogsPage = lazy(() => import('./pages/Logs').then((m) => ({ default: m.LogsPage })));
const HelpPage = lazy(() => import('./pages/Help').then((m) => ({ default: m.HelpPage })));
const RequestsPage = lazy(() => import('./pages/Requests').then((m) => ({ default: m.RequestsPage })));
const ChangelogPage = lazy(() => import('./pages/Changelog').then((m) => ({ default: m.ChangelogPage })));
const GuestDayPage = lazy(() => import('./pages/GuestDay').then((m) => ({ default: m.GuestDayPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPasswordPage })));
const ForceChangePasswordPage = lazy(() => import('./pages/ForceChangePassword').then((m) => ({ default: m.ForceChangePasswordPage })));
import { AuthGuard, OwnerGuard, ConfidantGuard, GuestFeatureGuard } from './components/AuthGuard';
import { useGlobalSpoilerHandler } from './lib/spoilers';
import { AppGate } from './components/ConfidantPinSetup';
import { DesktopSidebar, GuestDesktopSidebar } from './components/DesktopJournalLayout';
import { PullToRefresh } from './components/PullToRefresh';
import { PushHealthBanner } from './components/PushHealthBanner';
import { DeploymentBanner } from './components/DeploymentBanner';
import { ServerEventsBridge } from './components/ServerEventsBridge';
import { RightColumnTracker } from './components/RightColumnTracker';
import { ChatFab } from './components/ChatFab';
import { SyncProvider } from './lib/sync/SyncProvider';
import { PinProvider } from './contexts/PinContext';
import { DialogHost } from './lib/dialog';
import { ToastHost } from './lib/toast';

function AppResumeRefresher() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      queryClient.invalidateQueries();
    };
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_REQUESTED') {
        // Notif push reçue → invalide tout pour refléter le nouvel état
        // (utile surtout pour le guest qui n'a pas de Dexie sync).
        queryClient.invalidateQueries();
      }
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', refresh);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, [queryClient]);
  return null;
}

function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-warning/90 text-bg-primary text-xs font-medium py-1.5 px-4 backdrop-blur-sm">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      Hors ligne — les notes sont sauvegardées localement
    </div>
  );
}

function NoteRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/?entryId=${id ?? ''}`} replace />;
}

function OwnerDesktopSidebar() {
  const { data, isLoading } = trpc.auth.me.useQuery(undefined, { retry: false });
  if (isLoading || !data || data.role !== 'OWNER') return null;
  return (
    <div className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[232px] z-30 flex-col">
      <DesktopSidebar />
    </div>
  );
}

function GuestOwnerDesktopSidebar() {
  const { data, isLoading } = trpc.auth.me.useQuery(undefined, { retry: false });
  if (isLoading || !data || data.role !== 'GUEST') return null;
  return (
    <div className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[232px] z-30 flex-col">
      <GuestDesktopSidebar />
    </div>
  );
}

function RoleRouter() {
  const { data, isError, isLoading } = trpc.auth.me.useQuery(undefined, { retry: false });
  if (isLoading) return null;
  if (isError || !data) return <Navigate to="/login" replace />;
  return data.role === 'GUEST' ? <GuestHome /> : <HomePage />;
}

function TodayRouter() {
  const { data, isError, isLoading } = trpc.auth.me.useQuery(undefined, { retry: false });
  if (isLoading) return null;
  if (isError || !data) return <Navigate to="/login" replace />;
  return data.role === 'GUEST' ? <GuestDayPage /> : <HomePage />;
}

export function App() {
  // Listener global pour révéler les `||spoilers||` au click — un seul handler
  // dans tout l'arbre plutôt qu'un par span.
  useGlobalSpoilerHandler();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              const msg = error instanceof Error ? error.message : String(error);
              if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) return false;
              return failureCount < 1;
            },
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },
        },
      }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <PinProvider>
          <SyncProvider>
          <BrowserRouter>
            <AppResumeRefresher />
            <PullToRefresh />
            {/* Pile de bannières système : empilées verticalement, plus de
                superposition top-0/z-50 (BUG-07). */}
            <div className="banner-stack fixed top-0 left-0 right-0 z-50 flex flex-col pointer-events-none">
              <OfflineBanner />
              <PushHealthBanner />
              <DeploymentBanner />
            </div>
            <ServerEventsBridge />
            <RightColumnTracker />
            <DialogHost />
            <ToastHost />
            <OwnerDesktopSidebar />
            <GuestOwnerDesktopSidebar />
            <AppGate>
              {/* Le padding-bottom (réserve pour la bulle de chat flottante) est
                  appliqué localement dans la colonne de gauche de chaque page
                  qui scinde en deux — pas globalement — pour ne pas affecter
                  la colonne de droite. Sur mobile, la BottomNav joue ce rôle. */}
              <div className="lg:pl-[232px]">
              <ChatFab />
              <Suspense fallback={null}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/force-change-password" element={<ForceChangePasswordPage />} />
                  {/* /reset-password (flow email) reste dispo dans le code mais
                      n'est plus mappé — on a choisi un flow plus simple pour ce
                      cas d'usage : régénération manuelle par l'owner depuis
                      Réglages → Confidents (cf. `guests.regeneratePassword`). */}
                  <Route path="/rejoindre" element={<AcceptInvitationPage />} />
                  <Route path="/" element={<AuthGuard><RoleRouter /></AuthGuard>} />
                  <Route path="/timeline" element={<OwnerGuard><TimelinePage /></OwnerGuard>} />
                  <Route path="/calendrier" element={<GuestFeatureGuard feature="guestCanViewCalendar"><CalendarPage /></GuestFeatureGuard>} />
                  <Route path="/barometre" element={<AuthGuard><BarometrePage /></AuthGuard>} />
                  <Route path="/tasks" element={<ConfidantGuard><TasksPage /></ConfidantGuard>} />
                  <Route path="/collection" element={<ConfidantGuard><CollectionPage /></ConfidantGuard>} />
                  <Route path="/stats" element={<ConfidantGuard><StatsPage /></ConfidantGuard>} />
                  <Route path="/settings" element={<OwnerGuard><SettingsPage /></OwnerGuard>} />
                  <Route path="/reglages" element={<ConfidantGuard><GuestSettingsPage /></ConfidantGuard>} />
                  <Route path="/fil" element={<AuthGuard><CommentsActivityPage /></AuthGuard>} />
                  <Route path="/brouillons" element={<OwnerGuard><DraftsPage /></OwnerGuard>} />
                  <Route path="/api-docs" element={<OwnerGuard><ApiDocsPage /></OwnerGuard>} />
                  <Route path="/logs" element={<OwnerGuard><LogsPage /></OwnerGuard>} />
                  <Route path="/agenda" element={<GuestFeatureGuard feature="guestCanViewAgenda"><AgendaPage /></GuestFeatureGuard>} />
                  <Route path="/budget" element={<GuestFeatureGuard feature="guestCanViewBudget"><BudgetPage /></GuestFeatureGuard>} />
                  <Route path="/note/:id" element={<AuthGuard><NoteRedirect /></AuthGuard>} />
                  <Route path="/contacts" element={<ConfidantGuard><ContactsPage /></ConfidantGuard>} />
                  <Route path="/help" element={<AuthGuard><HelpPage /></AuthGuard>} />
                  <Route path="/help/:slug" element={<AuthGuard><HelpPage /></AuthGuard>} />
                  <Route path="/demandes" element={<AuthGuard><RequestsPage /></AuthGuard>} />
                  <Route path="/nouveautes" element={<AuthGuard><ChangelogPage /></AuthGuard>} />
                  <Route path="/aujourd-hui" element={<AuthGuard><TodayRouter /></AuthGuard>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
              </div>
            </AppGate>
          </BrowserRouter>
          </SyncProvider>
        </PinProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
