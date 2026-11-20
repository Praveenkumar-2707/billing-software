/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import {
  FileSpreadsheet,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CreateCustomerModal } from './components/CreateCustomerModal';
import { CreateInvoiceModal } from './components/CreateInvoiceModal';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GstBillingView } from './components/GstBillingView';
import { InventoryView } from './components/InventoryView';
import { InvoicePreviewModal } from './components/InvoicePreviewModal';
import { LoginScreen } from './components/LoginScreen';
import { RemainingPaymentsView } from './components/RemainingPaymentsView';
import { SettingsView } from './components/SettingsModal';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  type AdminSession,
  clearAdminSession,
  getAdminSession,
} from './services/adminAuth';
import {
  ensureUserProfile,
  seedSampleWorkspaceData,
  setDemoMode,
} from './services/billingService';
import { subscribeDemoStore } from './services/demoStore';
import { toMillisSafe } from './utils/format';
import type {
  AppPage,
  Customer,
  GstFiling,
  Invoice,
  PaymentRecord,
  StackItem,
  UserProfile,
} from './types';

function getInitialDemoFlag(): boolean {
  if (typeof window === 'undefined') return false;
  const hasQuery = new URLSearchParams(window.location.search).get('demo') === '1';
  const hasHash = window.location.hash === '#demo';
  const flag = hasQuery || hasHash;
  setDemoMode(flag);
  return flag;
}

function WorkspaceApp() {
  const [demoMode, setDemoModeState] = useState<boolean>(getInitialDemoFlag);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(() => getAdminSession());
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(() => getInitialDemoFlag() || Boolean(getAdminSession()));

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stacks, setStacks] = useState<StackItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [gstFilings, setGstFilings] = useState<GstFiling[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [activePage, setActivePage] = useState<AppPage>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [preselectedStackId, setPreselectedStackId] = useState<string | undefined>(undefined);
  const [preselectedCustomerId, setPreselectedCustomerId] = useState<string | undefined>(undefined);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  const isLocalWorkspace = demoMode || Boolean(adminSession);

  const handleAdminLogin = (session: AdminSession) => {
    setDemoMode(true);
    setAdminSession(session);
    setAuthReady(true);
    setActivePage('dashboard');
  };

  const exitLocalOrSignOut = () => {
    if (demoMode) {
      setDemoModeState(false);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('demo');
        if (url.hash === '#demo') url.hash = '';
        window.history.replaceState({}, '', url.toString());
      }
    }
    if (adminSession) {
      clearAdminSession();
      setAdminSession(null);
    }
    setActivePage('dashboard');
    if (user) {
      void signOut(auth);
    } else {
      setDemoMode(false);
      setProfile(null);
      setStacks([]);
      setCustomers([]);
      setInvoices([]);
      setPayments([]);
      setGstFilings([]);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (demoMode || adminSession) return;
      if (firebaseUser) {
        try {
          const ensured = await ensureUserProfile(firebaseUser);
          setProfile(ensured);
        } catch (err) {
          console.error(err);
        }
      } else {
        setProfile(null);
        setStacks([]);
        setCustomers([]);
        setInvoices([]);
        setPayments([]);
        setGstFilings([]);
        setDataLoading(false);
      }
    });
    return () => unsub();
  }, [demoMode, adminSession]);

  useEffect(() => {
    if (isLocalWorkspace) {
      setDemoMode(true);
      setDataLoading(true);
      const unsubDemo = subscribeDemoStore((snap) => {
        setProfile(snap.profile);
        setStacks(snap.stacks);
        setCustomers(snap.customers);
        setInvoices(snap.invoices);
        setPayments(snap.payments);
        setGstFilings(snap.gstFilings);
        setDataLoading(false);
      });
      return () => unsubDemo();
    }

    setDemoMode(false);
    if (!authReady || !user) return;
    setDataLoading(true);
    const uid = user.uid;
    let settledCount = 0;
    const markSettled = () => {
      settledCount += 1;
      if (settledCount >= 5) {
        setDataLoading(false);
      }
    };

    const unsubUser = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `users/${uid}`)
    );

    const unsubStacks = onSnapshot(
      query(collection(db, 'stacks'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<StackItem, 'id'>) }))
          .sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));
        setStacks(list);
        markSettled();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'stacks')
    );

    const unsubCustomers = onSnapshot(
      query(collection(db, 'customers'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Customer, 'id'>) }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setCustomers(list);
        markSettled();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'customers')
    );

    const unsubInvoices = onSnapshot(
      query(collection(db, 'invoices'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Invoice, 'id'>) }))
          .sort((a, b) => {
            const aTime = Math.max(toMillisSafe(a.updatedAt), toMillisSafe(a.createdAt));
            const bTime = Math.max(toMillisSafe(b.updatedAt), toMillisSafe(b.createdAt));
            return bTime - aTime;
          });
        setInvoices(list);
        markSettled();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'invoices')
    );

    const unsubPayments = onSnapshot(
      query(collection(db, 'payments'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecord, 'id'>) }))
          .sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));
        setPayments(list);
        markSettled();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'payments')
    );

    const unsubFilings = onSnapshot(
      query(collection(db, 'gstFilings'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<GstFiling, 'id'>) }))
          .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth));
        setGstFilings(list);
        markSettled();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'gstFilings')
    );

    return () => {
      unsubUser();
      unsubStacks();
      unsubCustomers();
      unsubInvoices();
      unsubPayments();
      unsubFilings();
    };
  }, [authReady, user, isLocalWorkspace]);

  const pendingBalancesCount = useMemo(
    () => invoices.filter((i) => i.paymentStatus !== 'paid' && i.remainingAmount > 0).length,
    [invoices]
  );

  const openNewInvoice = (stackId?: string) => {
    setPreselectedStackId(stackId);
    setPreselectedCustomerId(undefined);
    setCreateInvoiceOpen(true);
  };

  const openNewInvoiceForCustomer = (customerId: string) => {
    setPreselectedStackId(undefined);
    setPreselectedCustomerId(customerId);
    setCreateInvoiceOpen(true);
  };

  const handleNavigate = (page: AppPage) => {
    setActivePage(page);
    setMobileMenuOpen(false);
  };

  if (!authReady && !isLocalWorkspace) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <div className="text-sm text-neutral-500">Initializing ArthaMart workspace...</div>
      </div>
    );
  }

  if (!isLocalWorkspace && !user) {
    return <LoginScreen onAdminLogin={handleAdminLogin} />;
  }

  const effectiveUid = isLocalWorkspace ? 'demo-supermarket-owner' : user!.uid;

  const pageLabels: Record<AppPage, string> = {
    dashboard: 'Store Dashboard',
    inventory: 'Supermarket Stock',
    receivables: 'Customer Credit (Remaining)',
    'gst-billing': 'Monthly GST & Bills',
    settings: 'Store Settings',
  };

  const navItems: Array<{
    id: AppPage;
    label: string;
    icon: typeof LayoutDashboard;
    count?: number;
  }> = [
    { id: 'dashboard', label: 'Store Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Supermarket Stock', icon: Layers },
    {
      id: 'receivables',
      label: 'Remaining Payments',
      icon: Wallet,
      count: pendingBalancesCount > 0 ? pendingBalancesCount : undefined,
    },
    { id: 'gst-billing', label: 'Monthly GST & Bills', icon: FileSpreadsheet },
    { id: 'settings', label: 'Store Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-neutral-100 flex">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:flex lg:flex-col lg:w-64 bg-white border-r border-neutral-200 shrink-0">
        <div className="h-16 px-6 flex items-center gap-2.5 border-b border-neutral-200">
          <span className="w-2.5 h-6 rounded-xs bg-red-700 shrink-0" aria-hidden="true" />
          <span className="text-lg font-display font-bold tracking-tight text-neutral-900 whitespace-nowrap">
            ArthaMart POS
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  active
                    ? 'bg-red-50 text-red-800'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                }`}
              >
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <Icon className={`w-4 h-4 ${active ? 'text-red-700' : 'text-neutral-400'}`} />
                  <span>{item.label}</span>
                </span>
                {item.count !== undefined && (
                  <span className="text-xs font-mono font-semibold text-red-700 tabular-nums">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-neutral-200 space-y-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-neutral-900 truncate">
              {profile?.businessName || (isLocalWorkspace ? 'ArthaMart Supermarket' : user?.displayName)}
            </div>
            <div className="text-[11px] text-neutral-500 truncate">
              {adminSession
                ? `Admin · ${adminSession.userId} (${adminSession.phone})`
                : demoMode
                  ? 'Client Demo Mode · Unsaved locally'
                  : user?.email}
            </div>
          </div>
          <button
            type="button"
            onClick={exitLocalOrSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-neutral-700 border border-neutral-300 rounded-lg hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{demoMode && !adminSession ? 'Exit Demo' : 'Sign Out'}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden bg-neutral-900/40 flex">
          <div className="w-64 bg-white h-full border-r border-neutral-200 flex flex-col">
            <div className="h-16 px-5 flex items-center justify-between border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <span className="w-2 h-5 rounded-xs bg-red-700 shrink-0" aria-hidden="true" />
                <span className="text-lg font-display font-bold text-neutral-900">ArthaMart POS</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="text-neutral-500 hover:text-neutral-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg cursor-pointer ${
                      active ? 'bg-red-50 text-red-800' : 'text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${active ? 'text-red-700' : 'text-neutral-400'}`} />
                      <span>{item.label}</span>
                    </span>
                    {item.count !== undefined && (
                      <span className="text-xs font-mono font-semibold text-red-700">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-neutral-200">
              <button
                type="button"
                onClick={exitLocalOrSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-neutral-700 border border-neutral-300 rounded-lg hover:bg-neutral-100"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{demoMode && !adminSession ? 'Exit Demo' : 'Sign Out'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="no-print h-16 bg-white border-b border-neutral-200 px-4 sm:px-8 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-neutral-600 hover:text-neutral-900 cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-neutral-500 truncate">
              <span>{profile?.businessName || 'Workspace'}</span>
              <span className="mx-2 text-neutral-300">/</span>
              <span className="font-semibold text-neutral-900">{pageLabels[activePage]}</span>
              {demoMode && (
                <>
                  <span className="mx-2 text-neutral-300">·</span>
                  <span className="text-xs font-medium text-red-700">Client Demo Preview</span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => openNewInvoice()}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New POS Bill</span>
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {activePage === 'dashboard' && (
            <DashboardView
              stacks={stacks}
              customers={customers}
              invoices={invoices}
              gstFilings={gstFilings}
              loading={dataLoading}
              onNavigate={handleNavigate}
              onOpenNewInvoice={openNewInvoice}
              onOpenNewInvoiceForCustomer={openNewInvoiceForCustomer}
              onOpenAddCustomer={() => setCreateCustomerOpen(true)}
              onViewInvoice={(inv) => setPreviewInvoice(inv)}
              onSeedSampleData={() =>
                seedSampleWorkspaceData(effectiveUid, profile?.stateCode || '27-Maharashtra')
              }
            />
          )}

          {activePage === 'inventory' && (
            <InventoryView
              ownerId={effectiveUid}
              stacks={stacks}
              onOpenNewInvoice={openNewInvoice}
            />
          )}

          {activePage === 'receivables' && (
            <RemainingPaymentsView
              ownerId={effectiveUid}
              profile={profile}
              invoices={invoices}
              payments={payments}
              gstFilings={gstFilings}
              onViewInvoice={(inv) => setPreviewInvoice(inv)}
            />
          )}

          {activePage === 'gst-billing' && (
            <GstBillingView
              ownerId={effectiveUid}
              profile={profile}
              invoices={invoices}
              payments={payments}
              gstFilings={gstFilings}
              onOpenNewInvoice={() => openNewInvoice()}
              onViewInvoice={(inv) => setPreviewInvoice(inv)}
            />
          )}

          {activePage === 'settings' && profile && (
            <SettingsView
              profile={profile}
              isAdminSession={Boolean(adminSession)}
              onAdminCredentialsUpdated={(updated) =>
                setAdminSession((prev) =>
                  prev
                    ? {
                        ...prev,
                        userId: updated.userId,
                        phone: updated.phone,
                        displayName: updated.displayName,
                      }
                    : prev
                )
              }
            />
          )}
        </main>
      </div>

      {createCustomerOpen && (
        <CreateCustomerModal
          ownerId={effectiveUid}
          profile={profile}
          onClose={() => setCreateCustomerOpen(false)}
        />
      )}

      {createInvoiceOpen && (
        <CreateInvoiceModal
          ownerId={effectiveUid}
          profile={profile}
          stacks={stacks}
          customers={customers}
          invoices={invoices}
          gstFilings={gstFilings}
          preselectedStackId={preselectedStackId}
          preselectedCustomerId={preselectedCustomerId}
          onClose={() => {
            setCreateInvoiceOpen(false);
            setPreselectedCustomerId(undefined);
          }}
        />
      )}

      {previewInvoice && (
        <InvoicePreviewModal
          invoice={invoices.find((i) => i.id === previewInvoice.id) || previewInvoice}
          profile={profile}
          payments={payments.filter((p) => p.invoiceId === previewInvoice.id)}
          onClose={() => setPreviewInvoice(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WorkspaceApp />
    </ErrorBoundary>
  );
}
