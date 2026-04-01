/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  signInAnonymously,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  onSnapshot, 
  query, 
  where, 
  limit,
  addDoc, 
  updateDoc, 
  deleteDoc, 
  orderBy, 
  Timestamp,
  serverTimestamp,
  getDocFromServer,
  writeBatch,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { 
  LayoutDashboard, 
  Users, 
  ClipboardList, 
  History, 
  TrendingUp, 
  LogOut, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Coins, 
  Trophy, 
  Target, 
  ChevronRight, 
  Settings,
  Bell,
  Award,
  ArrowUpCircle,
  ArrowDownCircle,
  Calendar,
  DollarSign,
  UserCircle,
  ArrowLeft,
  Image as ImageIcon,
  Info,
  Minus,
  MinusCircle,
  Plus,
  PlusCircle,
  Menu,
  RotateCcw,
  X,
  Home,
  BookOpen,
  Heart,
  Smile,
  UserCheck,
  Palette,
  Rocket,
  Star,
  Upload,
  Camera,
  Search,
  Filter,
  Lock,
  Unlock,
  Shield,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // In a real app, we'd show a toast or error boundary
}

// --- Types ---
interface UserProfile {
  uid: string;
  email: string;
  role: 'admin';
  familyId?: string;
}

interface Family {
  id: string;
  ownerUid: string;
  members: string[]; // emails
  parentPin?: string;
  coinToRealRate?: number; // 1 moeda = X reais
  createdAt: any;
}

interface Child {
  id: string;
  familyId: string;
  name: string;
  themeColor: string;
  balance: number;
  level: number;
  points: number;
  monthlyGoal: number;
  dailyGoal: number;
  avatarUrl?: string;
  pin: string;
}

interface Task {
  id: string;
  familyId: string;
  name: string;
  type: 'positive' | 'negative';
  value: number;
  category: string;
  level: 'leve' | 'médio' | 'grave';
  recoverable: boolean;
}

interface Transaction {
  id: string;
  childId: string;
  familyId: string;
  amount: number;
  type: 'reward' | 'penalty' | 'recovery';
  description: string;
  timestamp: any;
  isRecoverable?: boolean;
  recovered?: boolean;
}

interface Notification {
  id: string;
  childId: string;
  familyId: string;
  message: string;
  type: 'success' | 'warning' | 'info' | 'goal';
  timestamp: any;
  read: boolean;
}

interface LibraryItem {
  id: string;
  familyId: string;
  url: string;
  name: string;
  createdAt: any;
}

interface MonthlyStatement {
  id: string;
  childId: string;
  familyId: string;
  month: number;
  year: number;
  totalCoins: number;
  totalBrl: number;
  closingDate: any;
}

// --- Gamification Logic ---
const calculateLevel = (points: number) => Math.floor(Math.sqrt(points / 10)) + 1;
const pointsForNextLevel = (level: number) => Math.pow(level, 2) * 10;

const BADGES = [
  { id: 'first_step', name: 'Primeiro Passo', description: 'Ganhou sua primeira moeda!', icon: <Award className="w-6 h-6 text-yellow-500" />, condition: (child: Child) => child.points > 0 },
  { id: 'saver', name: 'Super Poupador', description: 'Acumulou 100 moedas!', icon: <Coins className="w-6 h-6 text-blue-500" />, condition: (child: Child) => child.balance >= 100 },
  { id: 'goal_getter', name: 'Alcançador de Metas', description: 'Atingiu sua meta mensal!', icon: <Target className="w-6 h-6 text-green-500" />, condition: (child: Child) => child.balance >= child.monthlyGoal && child.monthlyGoal > 0 },
  { id: 'level_5', name: 'Toca Aqui', description: 'Chegou ao Nível 5!', icon: <Trophy className="w-6 h-6 text-purple-500" />, condition: (child: Child) => child.level >= 5 },
];

// --- Components ---

const safeFormat = (date: Date | undefined | null, formatStr: string) => {
  if (!date || isNaN(date.getTime())) return '...';
  return format(date, formatStr);
};

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      setHasError(true);
      setErrorMsg(e.message);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Algo deu errado</h1>
          <p className="text-gray-600 mb-6">{errorMsg}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors"
          >
            Recarregar Aplicativo
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const ConfirmationModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = "Confirmar", 
  cancelText = "Cancelar",
  type = "danger" 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: () => void, 
  title: string, 
  message: string, 
  confirmText?: string, 
  cancelText?: string,
  type?: "danger" | "warning" | "info"
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden"
      >
        <div className="p-8 text-center">
          <div className={cn(
            "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4",
            type === "danger" ? "bg-rose-100 text-rose-600" : 
            type === "warning" ? "bg-amber-100 text-amber-600" : 
            "bg-indigo-100 text-indigo-600"
          )}>
            {type === "danger" ? <Trash2 className="w-8 h-8" /> : 
             type === "warning" ? <AlertCircle className="w-8 h-8" /> : 
             <CheckCircle2 className="w-8 h-8" />}
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
          <p className="text-slate-500 mb-6">
            {message}
          </p>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all"
            >
              {cancelText}
            </button>
            <button 
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={cn(
                "flex-1 px-6 py-3 text-white font-bold rounded-2xl transition-all shadow-lg",
                type === "danger" ? "bg-rose-600 hover:bg-rose-700 shadow-rose-100" : 
                type === "warning" ? "bg-amber-600 hover:bg-amber-700 shadow-amber-100" : 
                "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100"
              )}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const Auth = ({ onChildLogin }: { onChildLogin?: (child: Child) => void }) => {
  const [error, setError] = useState<string | React.ReactNode>('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'parent' | 'child'>('parent');
  const [childName, setChildName] = useState('');
  const [childPin, setChildPin] = useState('');

  const [showDebug, setShowDebug] = useState(false);

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      const userRef = doc(db, 'users', result.user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: result.user.uid,
          email: result.user.email,
          role: 'admin'
        });
      }
    } catch (err: any) {
      console.error('Auth Error:', err);
      if (err.code === 'auth/network-request-failed') {
        setError('Erro de conexão. Verifique sua internet ou se algum bloqueador de anúncios está impedindo o acesso ao Firebase.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError('O login foi cancelado. Tente novamente.');
      } else if (err.code === 'auth/popup-blocked') {
        setError(
          <span>
            O navegador bloqueou a janela de login. Por favor, habilite popups para este site ou 
            <button 
              onClick={() => window.open(window.location.href, '_blank')}
              className="inline-block ml-1 underline font-bold text-rose-700"
            >
              clique aqui para abrir em uma nova aba
            </button> e tentar novamente.
          </span>
        );
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('O login com Google não está ativado no Console do Firebase.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChildLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Ensure we have some form of auth to query Firestore
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (anonErr: any) {
          console.error('Anon Auth Error:', anonErr);
          if (anonErr.code === 'auth/admin-restricted-operation' || anonErr.code === 'auth/operation-not-allowed') {
            const projectId = (auth.app.options as any).projectId || 'desconhecido';
            setError(
              <span>
                O login de crianças requer que o "Login Anônimo" esteja ativado no Console do Firebase. 
                <a 
                  href={`https://console.firebase.google.com/project/${projectId}/authentication/providers`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block mt-2 underline font-bold text-indigo-700"
                >
                  Clique aqui para abrir o Console do Firebase e ativar (Projeto: {projectId})
                </a>
              </span>
            );
            return;
          }
          throw anonErr;
        }
      }

      // Query for child with matching name and pin
      const q = query(
        collection(db, 'children'), 
        where('name', '==', childName.trim()), 
        where('pin', '==', childPin.trim()),
        limit(1)
      );
      const snap = await getDocs(q);
      
      if (snap.empty) {
        throw new Error('Nome ou senha incorretos.');
      }

      const childData = snap.docs[0].data();
      const child = { ...childData, id: snap.docs[0].id } as Child;
      
      if (onChildLogin) {
        onChildLogin(child);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 max-w-md w-full"
      >
        <div className="text-center mb-8">
          <div className="bg-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
            <Trophy className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">KidCoin</h1>
          <p className="text-slate-500 font-medium">Educação financeira divertida para crianças</p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
          <button 
            onClick={() => setMode('parent')}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
              mode === 'parent' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Pais
          </button>
          <button 
            onClick={() => setMode('child')}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
              mode === 'child' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Criança
          </button>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-xl mb-6 flex items-center gap-3 text-sm font-medium">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {mode === 'parent' ? (
          <div className="space-y-4">
            <button 
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full bg-white border-2 border-slate-100 text-slate-700 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-50 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
              {loading ? 'Entrando...' : 'Entrar com Google'}
            </button>
            
            {window.self !== window.top && (
              <p className="text-[10px] text-center text-slate-400 px-4">
                Se o login não abrir, tente <button onClick={() => window.open(window.location.href, '_blank')} className="underline hover:text-indigo-600">abrir o app em uma nova aba</button>.
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleChildLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Seu Nome</label>
              <input 
                type="text" 
                value={childName} 
                onChange={e => setChildName(e.target.value)} 
                required 
                placeholder="Ex: João"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Sua Senha (PIN)</label>
              <input 
                type="password" 
                value={childPin} 
                onChange={e => setChildPin(e.target.value)} 
                required 
                maxLength={4}
                placeholder="****"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-center tracking-widest text-xl font-black"
              />
            </div>
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:opacity-50"
            >
              {loading ? 'Entrando...' : 'Entrar na Minha Conta'}
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400 font-medium">
            Protegido por KidCoin Security • 2024
          </p>
          <button 
            onClick={() => setShowDebug(!showDebug)}
            className="mt-4 text-[10px] text-slate-300 hover:text-slate-500 transition-colors uppercase tracking-widest font-bold"
          >
            {showDebug ? 'Ocultar Diagnóstico' : 'Diagnóstico de Conexão'}
          </button>
          
          {showDebug && (
            <div className="mt-4 p-4 bg-slate-50 rounded-2xl text-left text-[10px] font-mono text-slate-500 break-all border border-slate-100">
              <p className="mb-1"><strong>Status:</strong> {auth.currentUser ? 'Autenticado' : 'Não Autenticado'}</p>
              <p className="mb-1"><strong>Auth Domain:</strong> {auth.app.options.authDomain}</p>
              <p className="mb-1"><strong>Project ID:</strong> {auth.app.options.projectId}</p>
              <p className="mb-1"><strong>API Key:</strong> {auth.app.options.apiKey?.substring(0, 6)}...</p>
              <div className="mt-3 p-2 bg-amber-50 rounded-lg text-amber-700 border border-amber-100">
                <p className="font-bold mb-1">Dicas para resolver o erro:</p>
                <ul className="list-disc ml-4 space-y-1">
                  <li>Desative bloqueadores de anúncios (AdBlock, uBlock, etc).</li>
                  <li>Verifique se sua internet não está bloqueando domínios do Firebase.</li>
                  <li>Certifique-se de que o domínio do app está nos "Domínios Autorizados" no Console do Firebase.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const TASK_CATEGORIES = [
  'Responsabilidades Domésticas',
  'Estudos e Desenvolvimento Intelectual',
  'Hábitos Saudáveis',
  'Comportamento e Atitudes',
  'Autonomia e Responsabilidade Pessoal',
  'Criatividade e Lazer Produtivo',
  'Desafios e Missões Especiais'
];

const ParentLock = ({ family, onUnlock }: { family: Family, onUnlock: () => void }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === family.parentPin) {
      onUnlock();
    } else {
      setError(true);
      setPin('');
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl text-center"
      >
        <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Shield className="w-10 h-10" />
        </div>
        
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Painel Protegido</h2>
        <p className="text-slate-500 mb-8">Insira o PIN de segurança para acessar as funções administrativas.</p>

        <form onSubmit={handlePinSubmit} className="space-y-6">
          <div className="relative">
            <input
              type={showPin ? "text" : "password"}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              className={cn(
                "w-full text-center text-4xl tracking-[1em] py-4 rounded-2xl border-2 outline-none transition-all",
                error ? "border-rose-500 bg-rose-50 animate-shake" : "border-slate-100 focus:border-indigo-500 bg-slate-50"
              )}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600"
            >
              {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {error && (
            <p className="text-rose-500 font-bold text-sm animate-bounce">PIN Incorreto!</p>
          )}

          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => {
                  if (val === 'C') setPin('');
                  else if (val === 'OK') handlePinSubmit({ preventDefault: () => {} } as any);
                  else setPin(prev => (prev + val).slice(0, 4));
                }}
                className={cn(
                  "h-16 rounded-2xl text-xl font-bold transition-all active:scale-95",
                  val === 'OK' ? "bg-indigo-600 text-white col-span-1" : 
                  val === 'C' ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-900 hover:bg-slate-100"
                )}
              >
                {val}
              </button>
            ))}
          </div>
        </form>

        <button 
          onClick={() => signOut(auth)}
          className="mt-8 text-slate-400 hover:text-slate-600 text-sm font-medium flex items-center justify-center gap-2 mx-auto"
        >
          <LogOut className="w-4 h-4" />
          Sair da Conta
        </button>
      </motion.div>
    </div>
  );
};

const Dashboard = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'children' | 'tasks' | 'history' | 'analytics' | 'library' | 'family'>('overview');
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [isChildMode, setIsChildMode] = useState(false);
  const [isParentUnlocked, setIsParentUnlocked] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: "danger" | "warning" | "info";
    confirmText?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'info'
  });

  const showConfirmation = (title: string, message: string, onConfirm: () => void, type: "danger" | "warning" | "info" = "info", confirmText?: string) => {
    setConfirmation({
      isOpen: true,
      title,
      message,
      onConfirm,
      type,
      confirmText
    });
  };
  
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u && isChildMode) {
        // If we are in child mode but lost auth session, try to sign in anonymously again
        try {
          await signInAnonymously(auth);
          // The next onAuthStateChanged call will handle setting the user and stopping the loader
          return;
        } catch (err) {
          console.error('Failed to restore anonymous session:', err);
        }
      }
      setUser(u);
      setIsLoading(false);
    });
    return () => unsub();
  }, [isChildMode]);

  useEffect(() => {
    const savedChildId = localStorage.getItem('kidcoin_child_id');
    if (savedChildId) {
      setSelectedChildId(savedChildId);
      setIsChildMode(true);
    }
  }, []);

  useEffect(() => {
    if (!user && !isChildMode) return;
    
    let active = true;
    let cleanupFunctions: (() => void)[] = [];

    const setupListeners = async () => {
      let familyId = '';
      
      if (isChildMode) {
        familyId = localStorage.getItem('kidcoin_family_id') || '';
        if (!familyId) {
          // Fallback to parentId for legacy
          familyId = localStorage.getItem('kidcoin_parent_id') || '';
        }
      } else if (user && !user.isAnonymous) {
        // Parent mode
        try {
          // 1. Check if user already has a familyId in their profile
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (!active) return;

          if (userDoc.exists() && userDoc.data().familyId) {
            familyId = userDoc.data().familyId;
          } else {
            // 2. Check if there's a family where this user is a member (by email)
            const qFamily = query(
              collection(db, 'families'), 
              where('members', 'array-contains', user.email),
              limit(1)
            );
            const familySnap = await getDocs(qFamily);
            if (!active) return;
            
            if (!familySnap.empty) {
              familyId = familySnap.docs[0].id;
              // Update user profile with familyId
              await setDoc(doc(db, 'users', user.uid), { 
                uid: user.uid, 
                email: user.email, 
                role: 'admin', 
                familyId 
              }, { merge: true });
            } else {
              // 3. Create a new family
              const newFamilyRef = doc(collection(db, 'families'));
              familyId = newFamilyRef.id;
              await setDoc(newFamilyRef, {
                id: familyId,
                ownerUid: user.uid,
                members: [user.email],
                createdAt: serverTimestamp()
              });
              // Update user profile
              await setDoc(doc(db, 'users', user.uid), { 
                uid: user.uid, 
                email: user.email, 
                role: 'admin', 
                familyId 
              }, { merge: true });
            }
          }
        } catch (err) {
          console.error('Error fetching family:', err);
        }
      }

      if (!familyId || !active) return;

      // Store familyId for child mode
      if (!isChildMode) {
        localStorage.setItem('kidcoin_family_id', familyId);
      }

      // Listen to family document
      const unsubFamily = onSnapshot(doc(db, 'families', familyId), (snap) => {
        if (snap.exists() && active) {
          setFamily({ ...snap.data(), id: snap.id } as Family);
        }
      }, (err) => handleFirestoreError(err, OperationType.GET, `families/${familyId}`));
      cleanupFunctions.push(unsubFamily);

      // Listen to children
      const qChildren = query(collection(db, 'children'), where('familyId', '==', familyId));
      const unsubChildren = onSnapshot(qChildren, (snap) => {
        if (active) setChildren(snap.docs.map(d => ({ ...d.data(), id: d.id } as Child)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'children'));
      cleanupFunctions.push(unsubChildren);

      // Listen to tasks
      const qTasks = query(collection(db, 'tasks'), where('familyId', '==', familyId));
      const unsubTasks = onSnapshot(qTasks, (snap) => {
        if (active) setTasks(snap.docs.map(d => ({ ...d.data(), id: d.id } as Task)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'));
      cleanupFunctions.push(unsubTasks);

      // Listen to transactions - limit to 100 most recent
      const qTransactions = query(
        collection(db, 'transactions'), 
        where('familyId', '==', familyId), 
        orderBy('timestamp', 'desc'),
        limit(100)
      );
      const unsubTransactions = onSnapshot(qTransactions, (snap) => {
        if (active) setTransactions(snap.docs.map(d => ({ ...d.data(), id: d.id, timestamp: d.data().timestamp?.toDate() } as any)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'));
      cleanupFunctions.push(unsubTransactions);

      // Listen to notifications - limit to 50 most recent
      const qNotifications = query(
        collection(db, 'notifications'), 
        where('familyId', '==', familyId), 
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const unsubNotifications = onSnapshot(qNotifications, (snap) => {
        if (active) setNotifications(snap.docs.map(d => ({ ...d.data(), id: d.id, timestamp: d.data().timestamp?.toDate() } as any)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'notifications'));
      cleanupFunctions.push(unsubNotifications);

      // Listen to library - limit to 50 items
      const qLibrary = query(
        collection(db, 'library'), 
        where('familyId', '==', familyId), 
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const unsubLibrary = onSnapshot(qLibrary, (snap) => {
        if (active) setLibraryItems(snap.docs.map(d => ({ ...d.data(), id: d.id, createdAt: d.data().createdAt?.toDate() } as any)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'library'));
      cleanupFunctions.push(unsubLibrary);

      // If in child mode, we also want to make sure the specific child is fetched
      if (isChildMode && selectedChildId) {
        const unsubSingleChild = onSnapshot(doc(db, 'children', selectedChildId), (docSnap) => {
          if (docSnap.exists() && active) {
            const childData = { ...docSnap.data(), id: docSnap.id } as Child;
            setChildren(prev => {
              const filtered = prev.filter(c => c.id !== childData.id);
              return [...filtered, childData];
            });
          }
        });
        cleanupFunctions.push(unsubSingleChild);
      }
    };

    setupListeners();

    return () => {
      active = false;
      cleanupFunctions.forEach(unsub => unsub());
    };
  }, [user?.uid, isChildMode, selectedChildId]);

  const selectedChild = useMemo(() => children.find(c => c.id === selectedChildId), [children, selectedChildId]);

  const calculateGains = (childId: string) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const childTransactions = transactions.filter(t => t.childId === childId);

    const dailyGain = childTransactions
      .filter(t => {
        const tDate = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
        return (t.type === 'reward' || t.type === 'recovery') && tDate >= todayStart;
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const monthlyGain = childTransactions
      .filter(t => {
        const tDate = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
        return (t.type === 'reward' || t.type === 'recovery') && tDate >= thirtyDaysAgo;
      })
      .reduce((sum, t) => sum + t.amount, 0);

    return { dailyGain, monthlyGain };
  };

  const handleRegisterAction = async (childId: string, taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    const child = children.find(c => c.id === childId);
    if (!task || !child || !user) return;

    if (task.type === 'positive') {
      const { dailyGain, monthlyGain } = calculateGains(childId);
      const limit = child.dailyGoal || 10;
      
      if (dailyGain + task.value > limit) {
        alert(`Limite diário atingido! Ganho hoje: ${dailyGain}/${limit} moedas.`);
        return;
      }
      
      if (monthlyGain + task.value > child.monthlyGoal) {
        alert(`Limite mensal (30 dias) atingido! Ganho no período: ${monthlyGain}/${child.monthlyGoal} moedas.`);
        return;
      }
    }

    const performAction = async () => {
      if (!family) return;
      const amount = task.type === 'positive' ? task.value : -task.value;
      const newBalance = child.balance + amount;
      const newPoints = child.points + (task.type === 'positive' ? task.value : 0);
      const newLevel = calculateLevel(newPoints);

      try {
        // Update child
        await updateDoc(doc(db, 'children', childId), {
          balance: newBalance,
          points: newPoints,
          level: newLevel
        });

        // Add transaction
        await addDoc(collection(db, 'transactions'), {
          childId,
          familyId: family.id,
          amount,
          type: task.type === 'positive' ? 'reward' : 'penalty',
          description: task.name,
          timestamp: serverTimestamp(),
          isRecoverable: task.type === 'negative' && task.recoverable,
          recovered: false
        });

        // Add notification
        await addDoc(collection(db, 'notifications'), {
          childId,
          familyId: family.id,
          message: task.type === 'positive' ? `Você ganhou ${task.value} moedas por: ${task.name}!` : `Você perdeu ${task.value} moedas por: ${task.name}`,
          type: task.type === 'positive' ? 'success' : 'warning',
          timestamp: serverTimestamp(),
          read: false
        });

        // Check for level up
        if (newLevel > child.level) {
          await addDoc(collection(db, 'notifications'), {
            childId,
            familyId: family.id,
            message: `Subiu de Nível! Você agora está no Nível ${newLevel}!`,
            type: 'goal',
            timestamp: serverTimestamp(),
            read: false
          });
        }

        // Check for goal
        if (newBalance >= child.monthlyGoal && child.balance < child.monthlyGoal && child.monthlyGoal > 0) {
          await addDoc(collection(db, 'notifications'), {
            childId,
            familyId: family.id,
            message: `Meta Atingida! Você alcançou sua meta de ${child.monthlyGoal} moedas!`,
            type: 'goal',
            timestamp: serverTimestamp(),
            read: false
          });
        }

      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'action_registration');
      }
    };

    const isPenalty = task.type === 'negative';
    const title = isPenalty ? "Confirmar Retirada?" : "Confirmar Crédito?";
    const message = isPenalty 
      ? `Você está prestes a retirar ${task.value} moedas de ${child.name} por: ${task.name}. Esta ação é irreversível.`
      : `Você está prestes a conceder ${task.value} moedas para ${child.name} por: ${task.name}. Esta ação é irreversível.`;
    
    showConfirmation(
      title, 
      message, 
      performAction, 
      isPenalty ? "danger" : "info", 
      isPenalty ? "Confirmar Retirada" : "Confirmar Crédito"
    );
  };

  const [closingId, setClosingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleMonthlyClosing = async (childId: string) => {
    const child = children.find(c => c.id === childId);
    if (!child || !user || !family) return;

    setClosingId(childId);
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    try {
      await addDoc(collection(db, 'monthlyStatements'), {
        childId,
        familyId: family.id,
        month,
        year,
        totalCoins: child.balance,
        totalBrl: family.coinToRealRate ? child.balance * family.coinToRealRate : child.balance,
        closingDate: serverTimestamp()
      });

      // Reset child balance to 0 for the new month
      await updateDoc(doc(db, 'children', childId), {
        balance: 0
      });

      setSuccessMsg(`Mês fechado para ${child.name}. Saldo zerado e extrato gerado.`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'monthly_closing');
    } finally {
      setClosingId(null);
    }
  };

  const handleRecoverPenalty = async (transaction: Transaction) => {
    const child = children.find(c => c.id === transaction.childId);
    if (!child || !user || transaction.type !== 'penalty' || !transaction.isRecoverable || transaction.recovered) return;

    const recoveryAmount = Math.floor(Math.abs(transaction.amount) * 0.5);
    
    const { dailyGain, monthlyGain } = calculateGains(child.id);
    const limit = child.dailyGoal || 10;
    
    if (dailyGain + recoveryAmount > limit) {
      alert(`Limite diário atingido! Ganho hoje: ${dailyGain}/${limit} moedas.`);
      return;
    }
    
    if (monthlyGain + recoveryAmount > child.monthlyGoal) {
      alert(`Limite mensal (30 dias) atingido! Ganho no período: ${monthlyGain}/${child.monthlyGoal} moedas.`);
      return;
    }

    const performAction = async () => {
      if (!family) return;
      const newBalance = child.balance + recoveryAmount;

      try {
        // Update transaction to mark as recovered
        await updateDoc(doc(db, 'transactions', transaction.id), {
          recovered: true
        });

        // Add recovery transaction
        await addDoc(collection(db, 'transactions'), {
          childId: child.id,
          familyId: family.id,
          amount: recoveryAmount,
          type: 'recovery',
          description: `Recuperação (50%): ${transaction.description}`,
          timestamp: serverTimestamp()
        });

        // Update child balance
        await updateDoc(doc(db, 'children', child.id), {
          balance: newBalance
        });

        // Add notification
        await addDoc(collection(db, 'notifications'), {
          childId: child.id,
          familyId: family.id,
          message: `Parabéns! Você recuperou ${recoveryAmount} moedas por pedir desculpas/reparar o dano em: ${transaction.description}`,
          type: 'success',
          timestamp: serverTimestamp(),
          read: false
        });

        setSuccessMsg(`Recuperação de ${recoveryAmount} moedas aprovada para ${child.name}.`);
        setTimeout(() => setSuccessMsg(null), 5000);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'recovery');
      }
    };

    showConfirmation(
      "Confirmar Recuperação?",
      `Você está prestes a devolver ${recoveryAmount} moedas (50% do valor) para ${child.name} por ter reparado o erro em: ${transaction.description}. Esta ação é irreversível.`,
      performAction,
      "info",
      "Confirmar Crédito"
    );
  };

  const handleClearHistory = async () => {
    if (!user || transactions.length === 0) return;
    
    showConfirmation(
      "Limpar Histórico?",
      "Você está prestes a apagar permanentemente o histórico de transações. Esta ação não pode ser desfeita.",
      async () => {
        try {
          const batch = writeBatch(db);
          // Firestore batch limit is 500. If more, we'd need multiple batches.
          // For simplicity, we'll clear the current visible transactions.
          transactions.slice(0, 500).forEach(t => {
            batch.delete(doc(db, 'transactions', t.id));
          });
          await batch.commit();
          setSuccessMsg("Histórico de transações limpo com sucesso.");
          setTimeout(() => setSuccessMsg(null), 5000);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'transactions');
        }
      },
      "danger",
      "Limpar Histórico"
    );
  };

  useEffect(() => {
    if (family?.parentPin) {
      setIsParentUnlocked(false);
    } else {
      setIsParentUnlocked(true);
    }
  }, [family?.parentPin]);

  const handleChildLogin = (child: Child) => {
    setChildren(prev => {
      const exists = prev.find(c => c.id === child.id);
      if (exists) return prev;
      return [...prev, child];
    });
    setSelectedChildId(child.id);
    setIsChildMode(true);
    // Persist child session
    localStorage.setItem('kidcoin_child_id', child.id);
    localStorage.setItem('kidcoin_family_id', child.familyId);
  };

  const handleChildLogout = () => {
    setIsChildMode(false);
    setSelectedChildId(null);
    localStorage.removeItem('kidcoin_child_id');
    localStorage.removeItem('kidcoin_parent_id');
  };

  const isParent = user && !user.isAnonymous;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"
          />
          <h3 className="text-lg font-bold text-slate-900 mb-1">Iniciando KidCoin</h3>
          <p className="text-sm text-slate-500">Conectando ao cofre seguro... Isso pode levar alguns segundos.</p>
        </div>
      </div>
    );
  }

  if (!isParent && !isChildMode) return <Auth onChildLogin={handleChildLogin} />;

  if (isChildMode) {
    if (!selectedChild) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="text-center max-w-xs">
            <motion.div 
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4"
            >
              <Users className="text-indigo-600 w-8 h-8" />
            </motion.div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Buscando seu perfil</h3>
            <p className="text-sm text-slate-500 mb-4">Quase lá! Estamos preparando suas moedas...</p>
            
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-6 text-left">
              <p className="text-xs text-amber-800 leading-relaxed">
                <strong>Dica:</strong> Se demorar muito, peça para seu pai/mãe entrar na conta deles e clicar no seu nome uma vez. Isso ajuda o sistema a te encontrar mais rápido!
              </p>
            </div>

            <button 
              onClick={handleChildLogout}
              className="text-xs font-bold text-indigo-600 uppercase tracking-widest hover:text-indigo-700"
            >
              Cancelar e Voltar
            </button>
          </div>
        </div>
      );
    }
    return (
      <ChildView 
        child={selectedChild} 
        tasks={tasks}
        transactions={transactions.filter(t => t.childId === selectedChild.id)}
        notifications={notifications.filter(n => n.childId === selectedChild.id)}
        family={family}
        onBack={handleChildLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Parent Lock Overlay */}
      {!isChildMode && family?.parentPin && !isParentUnlocked && (
        <ParentLock family={family} onUnlock={() => setIsParentUnlocked(true)} />
      )}

      {/* Mobile Sidebar Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] md:hidden"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-72 bg-white z-[70] flex flex-col shadow-2xl md:hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-600 p-2 rounded-lg">
                    <Trophy className="text-white w-5 h-5" />
                  </div>
                  <span className="font-bold text-xl text-slate-900">KidCoin</span>
                </div>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                <SidebarLink icon={<LayoutDashboard />} label="Visão Geral" active={activeTab === 'overview'} onClick={() => { setActiveTab('overview'); setIsMobileMenuOpen(false); }} />
                <SidebarLink icon={<Users />} label="Crianças" active={activeTab === 'children'} onClick={() => { setActiveTab('children'); setIsMobileMenuOpen(false); }} />
                <SidebarLink icon={<ClipboardList />} label="Tarefas" active={activeTab === 'tasks'} onClick={() => { setActiveTab('tasks'); setIsMobileMenuOpen(false); }} />
                <SidebarLink icon={<ImageIcon />} label="Biblioteca" active={activeTab === 'library'} onClick={() => { setActiveTab('library'); setIsMobileMenuOpen(false); }} />
                <SidebarLink icon={<Users />} label="Família" active={activeTab === 'family'} onClick={() => { setActiveTab('family'); setIsMobileMenuOpen(false); }} />
                <SidebarLink icon={<History />} label="Histórico" active={activeTab === 'history'} onClick={() => { setActiveTab('history'); setIsMobileMenuOpen(false); }} />
                <SidebarLink icon={<TrendingUp />} label="Análises" active={activeTab === 'analytics'} onClick={() => { setActiveTab('analytics'); setIsMobileMenuOpen(false); }} />
              </nav>

              <div className="p-4 border-t border-slate-100">
                <div className="flex items-center gap-3 px-4 py-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden">
                    <UserCircle className="text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{user?.email || 'Usuário'}</p>
                    <p className="text-xs text-slate-500">Pai/Mãe Admin</p>
                  </div>
                </div>
                <button 
                  onClick={() => signOut(auth)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Sair</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Trophy className="text-white w-5 h-5" />
          </div>
          <span className="font-bold text-xl text-slate-900">KidCoin</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <SidebarLink icon={<LayoutDashboard />} label="Visão Geral" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <SidebarLink icon={<Users />} label="Crianças" active={activeTab === 'children'} onClick={() => setActiveTab('children')} />
          <SidebarLink icon={<ClipboardList />} label="Tarefas" active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} />
          <SidebarLink icon={<ImageIcon />} label="Biblioteca" active={activeTab === 'library'} onClick={() => setActiveTab('library')} />
          <SidebarLink icon={<Users />} label="Família" active={activeTab === 'family'} onClick={() => setActiveTab('family')} />
          <SidebarLink icon={<History />} label="Histórico" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
          <SidebarLink icon={<TrendingUp />} label="Análises" active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} />
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 px-4 py-3 mb-2 group/parent">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden">
              <UserCircle className="text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {user?.email || (isChildMode ? children.find(c => c.id === selectedChildId)?.name : 'Usuário')}
              </p>
              <p className="text-xs text-slate-500">{isChildMode ? 'Perfil da Criança' : 'Pai/Mãe Admin'}</p>
            </div>
          </div>
          <button 
            onClick={() => signOut(auth)}
            className="w-full flex items-center gap-3 px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 text-slate-500 hover:text-indigo-600 md:hidden"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-sm md:text-lg font-semibold text-slate-900 capitalize">
              {activeTab === 'overview' ? 'Visão Geral' : 
               activeTab === 'children' ? 'Crianças' :
               activeTab === 'tasks' ? 'Tarefas' :
               activeTab === 'library' ? 'Biblioteca' :
               activeTab === 'history' ? 'Histórico' :
               activeTab === 'analytics' ? 'Análises' : activeTab}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            {family?.parentPin && (
              <button 
                onClick={() => setIsParentUnlocked(false)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                  isParentUnlocked ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-rose-100 text-rose-700"
                )}
              >
                {isParentUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                {isParentUnlocked ? 'DESBLOQUEADO' : 'BLOQUEADO'}
              </button>
            )}
            <button className="p-2 text-slate-400 hover:text-slate-600 relative">
              <Bell className="w-5 h-5" />
              {notifications.some(n => !n.read) && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>}
            </button>
            <button 
              onClick={() => {
                if (children.length > 0) {
                  setSelectedChildId(children[0].id);
                  setIsChildMode(true);
                } else {
                  alert('Adicione um perfil de criança primeiro!');
                }
              }}
              className="bg-indigo-600 text-white px-3 py-2 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-medium hover:bg-indigo-700 transition-all flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Visão da Criança</span>
              <span className="sm:hidden">Criança</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatCard 
                  title="Saldo Total" 
                  value={`${children.reduce((acc, c) => acc + c.balance, 0)} moedas`} 
                  icon={<Coins className="text-indigo-600" />}
                  trend={family?.coinToRealRate ? `Equivale a R$ ${(children.reduce((acc, c) => acc + c.balance, 0) * family.coinToRealRate).toFixed(2).replace('.', ',')}` : "+12% desde o mês passado"}
                />
                <StatCard 
                  title="Crianças Ativas" 
                  value={children.length.toString()} 
                  icon={<Users className="text-emerald-600" />}
                />
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-indigo-600" />
                    Registrar Ação
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Selecionar Criança</label>
                        <select 
                          className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                          onChange={(e) => setSelectedChildId(e.target.value)}
                          value={selectedChildId || ''}
                        >
                          <option value="">Escolha uma criança...</option>
                          {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Filtrar por Categoria</label>
                        <select 
                          className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                          onChange={(e) => setSelectedCategory(e.target.value)}
                          value={selectedCategory}
                        >
                          <option value="Todas">Todas as Categorias</option>
                          {TASK_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {tasks
                        .filter(task => selectedCategory === 'Todas' || task.category === selectedCategory)
                        .map(task => (
                        <button 
                          key={task.id}
                          disabled={!selectedChildId}
                          onClick={() => handleRegisterAction(selectedChildId!, task.id)}
                          className={cn(
                            "p-3 md:p-4 rounded-xl border text-left transition-all group disabled:opacity-50",
                            task.type === 'positive' 
                              ? "border-emerald-100 bg-emerald-50 hover:bg-emerald-100" 
                              : "border-rose-100 bg-rose-50 hover:bg-rose-100"
                          )}
                        >
                          <div className="flex justify-between items-start mb-1 md:mb-2">
                            <span className={cn(
                              "text-[8px] md:text-[10px] font-bold uppercase tracking-wider px-1.5 md:py-0.5 rounded",
                              task.type === 'positive' ? "bg-emerald-200 text-emerald-700" : "bg-rose-200 text-rose-700"
                            )}>
                              {task.type === 'positive' ? 'positivo' : 'negativo'}
                            </span>
                            <span className="text-xs md:text-base font-bold text-slate-900">{task.type === 'positive' ? '+' : '-'}{task.value}</span>
                          </div>
                          <p className="text-xs md:text-base font-semibold text-slate-800 line-clamp-1">{task.name}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 font-medium">{task.category}</span>
                            <span className={cn(
                              "text-[10px] font-bold uppercase",
                              task.level === 'grave' ? "text-red-600" : 
                              task.level === 'médio' ? "text-amber-600" : 
                              "text-blue-600"
                            )}>
                              • {task.level || 'leve'}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <History className="w-5 h-5 text-indigo-600" />
                    Atividade Recente
                  </h3>
                  <div className="space-y-4">
                    {transactions.slice(0, 5).map(t => (
                      <div key={t.id} className="flex items-center gap-3 md:gap-4 p-2 md:p-3 hover:bg-slate-50 rounded-xl transition-colors">
                        <div className={cn(
                          "w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center shrink-0",
                          t.type === 'reward' ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                        )}>
                          {t.type === 'reward' ? <ArrowUpCircle className="w-5 h-5 md:w-6 md:h-6" /> : <ArrowDownCircle className="w-5 h-5 md:w-6 md:h-6" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm md:text-base font-semibold text-slate-900 truncate">{t.description}</p>
                          <p className="text-[10px] md:text-xs text-slate-500 truncate">
                            <span className="font-bold text-indigo-600">{children.find(c => c.id === t.childId)?.name || 'Criança'}</span> • {safeFormat(t.timestamp, 'd MMM, HH:mm')}
                          </p>
                        </div>
                        <span className={cn("text-sm md:text-base font-bold shrink-0", t.type === 'reward' ? "text-emerald-600" : "text-rose-600")}>
                          {t.type === 'reward' ? '+' : ''}{t.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {successMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-700 flex items-center gap-3"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">{successMsg}</span>
            </motion.div>
          )}

          {activeTab === 'children' && (
            <ChildManagement 
              children={children} 
              user={user} 
              family={family}
              onClosing={handleMonthlyClosing} 
              closingId={closingId}
              libraryItems={libraryItems}
              transactions={transactions}
            />
          )}
          {activeTab === 'tasks' && <TaskManagement tasks={tasks} user={user} family={family} />}
          {activeTab === 'library' && <LibraryView items={libraryItems} user={user} family={family} children={children} />}
          {activeTab === 'history' && <HistoryView transactions={transactions} children={children} onRecover={handleRecoverPenalty} onClear={handleClearHistory} />}
          {activeTab === 'analytics' && <AnalyticsView transactions={transactions} children={children} />}
          {activeTab === 'family' && <FamilyManagement family={family} user={user} />}

          <AnimatePresence>
            {confirmation.isOpen && (
              <ConfirmationModal 
                isOpen={confirmation.isOpen}
                onClose={() => setConfirmation(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmation.onConfirm}
                title={confirmation.title}
                message={confirmation.message}
                type={confirmation.type}
                confirmText={confirmation.confirmText}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-around sticky bottom-0 z-50">
          <BottomNavLink icon={<LayoutDashboard className="w-5 h-5" />} label="Início" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <BottomNavLink icon={<Users className="w-5 h-5" />} label="Crianças" active={activeTab === 'children'} onClick={() => setActiveTab('children')} />
          <BottomNavLink icon={<ClipboardList className="w-5 h-5" />} label="Tarefas" active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} />
          <BottomNavLink icon={<ImageIcon className="w-5 h-5" />} label="Biblioteca" active={activeTab === 'library'} onClick={() => setActiveTab('library')} />
          <BottomNavLink icon={<History className="w-5 h-5" />} label="Histórico" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
        </nav>
      </main>
    </div>
  );
};

const BottomNavLink = ({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={cn(
      "flex flex-col items-center gap-1 p-2 rounded-xl transition-all",
      active ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
    )}
  >
    {icon}
    <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
  </button>
);

const LibraryView = ({ items, user, family, children }: { items: LibraryItem[], user: any, family: Family | null, children: Child[] }) => {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [selectedImage, setSelectedImage] = useState<LibraryItem | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Firestore limit is 1MB. Base64 adds ~33% overhead.
    // 800KB * 1.33 = ~1064KB. This is close to the 1MB limit.
    if (file.size > 800000) {
      alert("A imagem é muito grande! Por favor, escolha uma imagem menor que 800KB para garantir o salvamento.");
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      setUrl(reader.result as string);
      if (!name) {
        const fileName = file.name.split('.')[0];
        setName(fileName.charAt(0).toUpperCase() + fileName.slice(1));
      }
      setIsUploading(false);
    };
    reader.onerror = () => {
      alert("Erro ao ler o arquivo.");
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !user || !family) return;
    try {
      await addDoc(collection(db, 'library'), {
        familyId: family.id,
        url: url.trim(),
        name: name.trim() || 'Nova Imagem',
        createdAt: serverTimestamp()
      });
      setUrl('');
      setName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'library');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'library', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'library');
    }
  };

  const handleSetProfilePhoto = async (childId: string) => {
    if (!selectedImage) return;
    try {
      await updateDoc(doc(db, 'children', childId), {
        avatarUrl: selectedImage.url
      });
      setSelectedImage(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `children/${childId}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <h3 className="text-base md:text-xl font-bold mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-indigo-600" />
          Adicionar Nova Imagem
        </h3>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-5 relative">
              <input 
                type="url" 
                placeholder="URL da Imagem (https://...)" 
                value={url.startsWith('data:') ? 'Imagem carregada do dispositivo' : url}
                onChange={e => setUrl(e.target.value)}
                readOnly={url.startsWith('data:')}
                className={cn(
                  "w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500",
                  url.startsWith('data:') && "bg-slate-50 text-slate-500 italic"
                )}
              />
              {url.startsWith('data:') && (
                <button 
                  type="button"
                  onClick={() => { setUrl(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-500 hover:text-rose-700"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            
            <div className="md:col-span-4">
              <input 
                type="text" 
                placeholder="Nome da Imagem" 
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="md:col-span-3 flex gap-2">
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
              >
                <Camera className="w-5 h-5" />
                {isUploading ? '...' : 'Upload'}
              </button>
              <button 
                type="submit" 
                disabled={!url || isUploading}
                className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Salvar
              </button>
            </div>
          </div>
          
          {url.startsWith('data:') && (
            <div className="flex items-center gap-4 p-3 bg-indigo-50 rounded-2xl border border-indigo-100">
              <div className="w-12 h-12 rounded-lg overflow-hidden border border-white shadow-sm shrink-0">
                <img src={url} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <p className="text-xs text-indigo-700 font-medium">
                Imagem carregada com sucesso! Clique em <strong>Salvar</strong> para adicionar à biblioteca.
              </p>
            </div>
          )}
        </form>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-6">
        {items.map(item => (
          <div key={item.id} className="relative group bg-white p-2 md:p-3 rounded-xl md:rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
            <div className="relative aspect-square mb-2 md:mb-3">
              <img 
                src={item.url} 
                alt={item.name} 
                className="w-full h-full object-cover rounded-lg md:rounded-xl"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg md:rounded-xl flex items-center justify-center gap-1 md:gap-2">
                <button 
                  onClick={() => setSelectedImage(item)}
                  className="p-1.5 md:p-2 bg-white text-indigo-600 rounded-full shadow-lg hover:bg-indigo-50 transition-colors"
                  title="Usar como foto de perfil"
                >
                  <UserCircle size={16} className="md:w-[18px] md:h-[18px]" />
                </button>
                <button 
                  onClick={() => handleDelete(item.id)}
                  className="p-1.5 md:p-2 bg-white text-red-500 rounded-full shadow-lg hover:bg-red-50 transition-colors"
                  title="Excluir"
                >
                  <Trash2 size={16} className="md:w-[18px] md:h-[18px]" />
                </button>
              </div>
            </div>
            <p className="text-[10px] md:text-xs text-center font-bold text-slate-700 truncate">{item.name}</p>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {selectedImage && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Definir Foto de Perfil</h3>
                <button onClick={() => setSelectedImage(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              
              <div className="p-6">
                <div className="flex justify-center mb-6">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-indigo-100 shadow-lg">
                    <img 
                      src={selectedImage.url} 
                      alt="Preview" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
                
                <p className="text-sm text-slate-500 mb-4 text-center">
                  Escolha para qual filho você deseja definir esta foto:
                </p>
                
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                  {children.map(child => (
                    <button
                      key={child.id}
                      onClick={() => handleSetProfilePhoto(child.id)}
                      className="w-full flex items-center gap-4 p-3 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border-2" style={{ borderColor: child.themeColor }}>
                        {child.avatarUrl ? (
                          <img src={child.avatarUrl} alt={child.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <UserCircle className="text-slate-400 w-6 h-6" />
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{child.name}</p>
                        <p className="text-xs text-slate-500">Nível {child.level}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                    </button>
                  ))}
                  {children.length === 0 && (
                    <p className="text-center text-slate-400 italic py-4">Nenhum filho cadastrado.</p>
                  )}
                </div>
              </div>
              
              <div className="p-6 bg-slate-50 flex justify-end">
                <button 
                  onClick={() => setSelectedImage(null)}
                  className="px-6 py-2 text-slate-600 font-bold hover:text-slate-900 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FamilyManagement = ({ family, user }: { family: Family | null, user: any }) => {
  const [newEmail, setNewEmail] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [parentPin, setParentPin] = useState(family?.parentPin || '');
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [coinRate, setCoinRate] = useState(family?.coinToRealRate?.toString() || '0');
  const [isUpdatingRate, setIsUpdatingRate] = useState(false);

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!family) return;
    if (parentPin.length > 0 && parentPin.length !== 4) {
      alert('O PIN deve ter 4 dígitos.');
      return;
    }

    try {
      setIsUpdatingPin(true);
      await updateDoc(doc(db, 'families', family.id), {
        parentPin: parentPin || null
      });
      alert('Configurações de segurança atualizadas!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${family.id}`);
    } finally {
      setIsUpdatingPin(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!family || !newEmail.trim()) return;
    
    const email = newEmail.trim().toLowerCase();
    if (family.members.includes(email)) {
      alert('Este e-mail já tem acesso.');
      return;
    }

    setIsAdding(true);
    try {
      await updateDoc(doc(db, 'families', family.id), {
        members: arrayUnion(email)
      });
      setNewEmail('');
      alert('Acesso concedido com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${family.id}`);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveMember = async (email: string) => {
    if (!family) return;
    if (email === user.email) {
      alert('Você não pode remover seu próprio acesso.');
      return;
    }

    try {
      await updateDoc(doc(db, 'families', family.id), {
        members: arrayRemove(email)
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${family.id}`);
    }
  };

  const handleUpdateRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!family) return;
    
    const rate = parseFloat(coinRate.replace(',', '.'));
    if (isNaN(rate) || rate < 0) {
      alert('Por favor, insira um valor válido para a conversão.');
      return;
    }

    try {
      setIsUpdatingRate(true);
      await updateDoc(doc(db, 'families', family.id), {
        coinToRealRate: rate
      });
      alert('Taxa de conversão atualizada!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${family.id}`);
    } finally {
      setIsUpdatingRate(false);
    }
  };

  if (!family) return null;

  const isOwner = family.ownerUid === user.uid;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-emerald-600" />
          Conversão de Moedas (R$)
        </h3>
        
        <p className="text-sm text-slate-600 mb-6">
          Defina quanto vale cada moeda em Reais (R$). Isso ajudará a criança a entender o valor real do seu esforço.
        </p>

        <form onSubmit={handleUpdateRate} className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="w-full md:w-48">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">1 Moeda = R$</label>
            <input 
              type="text" 
              placeholder="Ex: 0.10" 
              value={coinRate}
              onChange={e => setCoinRate(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
            />
          </div>
          <button 
            type="submit" 
            disabled={isUpdatingRate}
            className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            Salvar Taxa
          </button>
          {family.coinToRealRate !== undefined && (
            <div className="text-sm font-medium text-slate-500 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
              Exemplo: 100 moedas = <span className="text-emerald-600 font-bold">R$ {(100 * family.coinToRealRate).toFixed(2).replace('.', ',')}</span>
            </div>
          )}
        </form>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" />
          Acesso Compartilhado (Família)
        </h3>
        
        <p className="text-sm text-slate-600 mb-6">
          Adicione o e-mail de outro pai ou mãe para que eles possam gerenciar as mesmas crianças e tarefas.
        </p>

        {isOwner ? (
          <form onSubmit={handleAddMember} className="flex gap-2 mb-8">
            <input 
              type="email" 
              placeholder="E-mail do outro pai/mãe" 
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              required
              className="flex-1 px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button 
              type="submit" 
              disabled={isAdding}
              className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              Convidar
            </button>
          </form>
        ) : (
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-amber-700 text-sm mb-8">
            Apenas o proprietário da família ({family.members[0]}) pode adicionar ou remover membros.
          </div>
        )}

        <div className="space-y-3">
          <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Membros com Acesso</h4>
          {family.members.map(email => (
            <div key={email} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                  {email.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-slate-700">{email}</span>
                {email === user.email && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">VOCÊ</span>}
              </div>
              {isOwner && email !== user.email && (
                <button 
                  onClick={() => handleRemoveMember(email)}
                  className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-600" />
          Segurança do Painel
        </h3>
        
        <p className="text-sm text-slate-600 mb-6">
          Defina um PIN de 4 dígitos para proteger o acesso às funções administrativas. Quando ativado, o painel será bloqueado após o login ou manualmente.
        </p>

        <form onSubmit={handleUpdatePin} className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-[200px]">
              <input 
                type={showPin ? "text" : "password"} 
                placeholder="PIN de 4 dígitos" 
                value={parentPin}
                onChange={e => setParentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-center tracking-widest font-bold"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button 
              type="submit" 
              disabled={isUpdatingPin}
              className="bg-slate-900 text-white px-6 py-2 rounded-xl font-bold hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Salvar PIN
            </button>
            {family.parentPin && (
              <button 
                type="button" 
                onClick={async () => {
                  if (window.confirm('Deseja realmente desativar a proteção por PIN?')) {
                    setParentPin('');
                    await updateDoc(doc(db, 'families', family.id), { parentPin: null });
                  }
                }}
                className="text-rose-600 text-sm font-bold hover:underline"
              >
                Desativar Proteção
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
const SidebarLink = ({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium",
      active ? "bg-indigo-50 text-indigo-600 shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
    )}
  >
    {React.cloneElement(icon as React.ReactElement, { className: "w-5 h-5" })}
    <span>{label}</span>
  </button>
);

const StatCard = ({ title, value, icon, trend }: { title: string, value: string, icon: React.ReactNode, trend?: string }) => (
  <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100">
    <div className="flex justify-between items-start mb-2 md:mb-4">
      <div className="p-2 md:p-3 bg-slate-50 rounded-xl">
        {React.cloneElement(icon as React.ReactElement, { className: "w-5 h-5 md:w-6 md:h-6" })}
      </div>
      {trend && <span className="text-[10px] md:text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">{trend}</span>}
    </div>
    <p className="text-xs md:text-sm font-medium text-slate-500 mb-1">{title}</p>
    <h4 className="text-xl md:text-2xl font-bold text-slate-900">{value}</h4>
  </div>
);

const ChildManagement = ({ children, user, family, onClosing, closingId, libraryItems, transactions }: { 
  children: Child[], 
  user: any, 
  family: Family | null,
  onClosing: (id: string) => void, 
  closingId: string | null,
  libraryItems: LibraryItem[],
  transactions: Transaction[]
}) => {
  const calculateGains = (childId: string) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);

    const childTransactions = transactions.filter(t => t.childId === childId);

    const dailyGain = childTransactions
      .filter(t => t.timestamp >= startOfDay && (t.type === 'reward' || t.type === 'recovery') && t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    const monthlyGain = childTransactions
      .filter(t => t.timestamp >= thirtyDaysAgo && (t.type === 'reward' || t.type === 'recovery') && t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    return { dailyGain, monthlyGain };
  };

  const [isAdding, setIsAdding] = useState(false);
  const [editingChild, setEditingChild] = useState<Child | null>(null);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState(100);
  const [dailyGoal, setDailyGoal] = useState(10);
  const [color, setColor] = useState('#4f46e5');
  const [pin, setPin] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string | undefined>();
  const [editingAvatarId, setEditingAvatarId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClosingId, setConfirmClosingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!family) return;
    try {
      await addDoc(collection(db, 'children'), {
        familyId: family.id,
        name,
        themeColor: color,
        balance: 0,
        level: 1,
        points: 0,
        monthlyGoal: goal,
        dailyGoal: dailyGoal,
        avatarUrl: selectedAvatar || '',
        pin: pin.trim() || '1234'
      });
      setIsAdding(false);
      setName('');
      setPin('');
      setSelectedAvatar(undefined);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'children');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChild) return;
    try {
      await updateDoc(doc(db, 'children', editingChild.id), {
        name,
        monthlyGoal: goal,
        dailyGoal: dailyGoal,
        themeColor: color,
        pin: pin.trim() || editingChild.pin
      });
      setEditingChild(null);
      setName('');
      setPin('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'children');
    }
  };

  const handleUpdateAvatar = async (childId: string, url: string) => {
    if (!childId) return;
    try {
      await updateDoc(doc(db, 'children', childId), {
        avatarUrl: url
      });
      setEditingAvatarId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'children');
    }
  };

  const handleDelete = async (id: string) => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'children', id));
      setConfirmDeleteId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'children');
    } finally {
      setIsDeleting(false);
    }
  };

  const startEditing = (child: Child) => {
    setEditingChild(child);
    setName(child.name);
    setGoal(child.monthlyGoal);
    setDailyGoal(child.dailyGoal || 10);
    setColor(child.themeColor);
    setPin(child.pin);
    setIsAdding(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-base md:text-xl font-bold text-slate-900">Gerenciar Crianças</h3>
        <button 
          onClick={() => {
            setIsAdding(true);
            setEditingChild(null);
            setName('');
            setGoal(100);
            setDailyGoal(10);
            setColor('#4f46e5');
            setPin('');
            setSelectedAvatar(undefined);
          }}
          className="bg-indigo-600 text-white px-3 py-2 md:px-4 md:py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-all text-xs md:text-sm"
        >
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Adicionar Criança</span><span className="sm:hidden">Adicionar</span>
        </button>
      </div>

      {(isAdding || editingChild) && (
        <motion.form 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={editingChild ? handleUpdate : handleAdd} 
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4"
        >
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-bold text-slate-900">{editingChild ? 'Editar Criança' : 'Nova Criança'}</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nome</label>
              <input value={name} onChange={e => setName(e.target.value)} required className="w-full px-4 py-2 rounded-lg border border-slate-200" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Senha (PIN 4 dígitos)</label>
              <input type="text" maxLength={4} value={pin} onChange={e => setPin(e.target.value)} required className="w-full px-4 py-2 rounded-lg border border-slate-200 text-center font-bold tracking-widest" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Meta Mensal (Moedas)</label>
              <input type="number" value={goal} onChange={e => setGoal(Number(e.target.value))} required className="w-full px-4 py-2 rounded-lg border border-slate-200" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Limite Diário (Moedas)</label>
              <input type="number" value={dailyGoal} onChange={e => setDailyGoal(Number(e.target.value))} required className="w-full px-4 py-2 rounded-lg border border-slate-200" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cor do Tema</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-full h-10 p-1 rounded-lg border border-slate-200" />
            </div>
          </div>
          
          {!editingChild && (
            <AvatarPicker 
              items={libraryItems} 
              selectedUrl={selectedAvatar} 
              onSelect={setSelectedAvatar} 
            />
          )}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setIsAdding(false); setEditingChild(null); }} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg">Cancelar</button>
            <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium">Salvar</button>
          </div>
        </motion.form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {children.map(child => (
          <div key={child.id} className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100 group">
            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="relative">
                <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-slate-100 flex items-center justify-center border-2 overflow-hidden" style={{ borderColor: child.themeColor }}>
                  {child.avatarUrl ? (
                    <img src={child.avatarUrl} alt={child.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <Users className="w-5 h-5 md:w-6 md:h-6 text-slate-400" />
                  )}
                </div>
                <button 
                  onClick={() => setEditingAvatarId(editingAvatarId === child.id ? null : child.id)}
                  className="absolute -bottom-1 -right-1 p-1 bg-white border border-slate-200 rounded-lg shadow-sm text-slate-600 hover:text-indigo-600 transition-colors"
                >
                  <ImageIcon size={10} className="md:w-3 md:h-3" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-base md:text-lg font-bold text-slate-900 truncate">{child.name}</h4>
                <p className="text-xs md:text-sm text-slate-500">Nível {child.level}</p>
              </div>
              <div className="flex gap-1 md:gap-2">
                <button 
                  onClick={() => setConfirmDeleteId(child.id)} 
                  className="p-1.5 md:p-2 text-rose-500 hover:bg-rose-50 rounded-lg border border-slate-100 transition-colors"
                  title="Excluir perfil"
                >
                  <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                </button>
              </div>
            </div>

            {editingAvatarId === child.id && (
              <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <AvatarPicker 
                  items={libraryItems} 
                  selectedUrl={child.avatarUrl} 
                  onSelect={(url) => handleUpdateAvatar(child.id, url)} 
                />
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-[10px] font-bold uppercase text-slate-400 mb-1">
                    <span>Ganho Hoje</span>
                    <span className={cn(
                      calculateGains(child.id).dailyGain >= (child.dailyGoal || 10) ? "text-amber-500" : "text-slate-600"
                    )}>
                      {calculateGains(child.id).dailyGain} / {child.dailyGoal || 10}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full transition-all duration-500", calculateGains(child.id).dailyGain >= (child.dailyGoal || 10) ? "bg-amber-500" : "bg-emerald-500")} 
                      style={{ width: `${Math.min((calculateGains(child.id).dailyGain / (child.dailyGoal || 10)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-bold uppercase text-slate-400 mb-1">
                    <span>Ganho Mensal</span>
                    <span className={cn(
                      calculateGains(child.id).monthlyGain >= child.monthlyGoal ? "text-amber-500" : "text-slate-600"
                    )}>
                      {calculateGains(child.id).monthlyGain} / {child.monthlyGoal}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full transition-all duration-500", calculateGains(child.id).monthlyGain >= child.monthlyGoal ? "bg-amber-500" : "bg-indigo-500")} 
                      style={{ width: `${Math.min((calculateGains(child.id).monthlyGain / child.monthlyGoal) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-500">Progresso Mensal</span>
                  <div className="text-right">
                    <span className="font-bold text-slate-900 block">{child.balance} / {child.monthlyGoal} moedas</span>
                    {family?.coinToRealRate !== undefined && family.coinToRealRate > 0 && (
                      <span className="text-[10px] font-bold text-emerald-600 uppercase">
                        Saldo: R$ {(child.balance * family.coinToRealRate).toFixed(2).replace('.', ',')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((child.balance / child.monthlyGoal) * 100, 100)}%` }}
                    className="h-full bg-indigo-600"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => setConfirmClosingId(child.id)}
                  disabled={closingId === child.id}
                  className="flex-1 bg-slate-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {closingId === child.id ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Calendar className="w-4 h-4" />
                  )}
                  {closingId === child.id ? 'Processando...' : 'Fechar Mês'}
                </button>
                <button 
                  onClick={() => startEditing(child)}
                  className="p-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {confirmClosingId && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden"
            >
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-8 h-8 text-amber-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Fechar Mês?</h3>
                <p className="text-slate-500 mb-6">
                  Você está prestes a fechar o mês de <strong>{children.find(c => c.id === confirmClosingId)?.name}</strong>. Isso irá gerar um extrato e <strong>ZERAR</strong> o saldo de moedas para o início de uma nova contagem.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setConfirmClosingId(null)}
                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => {
                      if (confirmClosingId) {
                        onClosing(confirmClosingId);
                        setConfirmClosingId(null);
                      }
                    }}
                    className="flex-1 px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {confirmDeleteId && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden"
            >
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-rose-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Excluir Perfil?</h3>
                <p className="text-slate-500 mb-6">
                  Você está prestes a excluir permanentemente o perfil de <strong>{children.find(c => c.id === confirmDeleteId)?.name}</strong>. Esta ação é irreversível e todos os dados serão perdidos.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setConfirmDeleteId(null)}
                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => handleDelete(confirmDeleteId)}
                    disabled={isDeleting}
                    className="flex-1 px-6 py-3 bg-rose-600 text-white font-bold rounded-2xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 disabled:opacity-50"
                  >
                    {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AvatarPicker = ({ items, selectedUrl, onSelect }: { items: LibraryItem[], selectedUrl?: string, onSelect: (url: string) => void }) => {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-700">Escolher Avatar da Biblioteca</label>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.url)}
            className={cn(
              "w-12 h-12 rounded-xl flex-shrink-0 border-2 transition-all overflow-hidden",
              selectedUrl === item.url ? "border-indigo-600 ring-2 ring-indigo-100" : "border-transparent hover:border-slate-200"
            )}
          >
            <img src={item.url} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </button>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-slate-400 italic">Nenhuma imagem na biblioteca. Adicione uma na aba Biblioteca.</p>
        )}
      </div>
    </div>
  );
};

const TaskManagement = ({ tasks, user, family }: { tasks: Task[], user: any, family: Family | null }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'positive' | 'negative'>('positive');
  const [value, setValue] = useState(10);
  const [category, setCategory] = useState(TASK_CATEGORIES[0]);
  const [level, setLevel] = useState<'leve' | 'médio' | 'grave'>('leve');
  const [recoverable, setRecoverable] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('Todas');
  const [filterType, setFilterType] = useState('Todos');
  const [filterLevel, setFilterLevel] = useState('Todos');

  const resetForm = () => {
    setName('');
    setType('positive');
    setValue(10);
    setCategory(TASK_CATEGORIES[0]);
    setLevel('leve');
    setRecoverable(false);
    setIsAdding(false);
    setEditingTask(null);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!family) return;
    try {
      await addDoc(collection(db, 'tasks'), {
        familyId: family.id,
        name,
        type,
        value,
        category,
        level,
        recoverable,
        id: ''
      });
      resetForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tasks');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    try {
      await updateDoc(doc(db, 'tasks', editingTask.id), {
        name,
        type,
        value,
        category,
        level,
        recoverable
      });
      resetForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'tasks');
    }
  };

  const startEditing = (task: Task) => {
    setEditingTask(task);
    setName(task.name);
    setType(task.type);
    setValue(task.value);
    setCategory(task.category || TASK_CATEGORIES[0]);
    setLevel(task.level || 'leve');
    setRecoverable(task.recoverable || false);
    setIsAdding(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', id));
      setConfirmDeleteId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'tasks');
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = task.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = filterCategory === 'Todas' || task.category === filterCategory;
      const matchesType = filterType === 'Todos' || 
        (filterType === 'Ganhos' && task.type === 'positive') || 
        (filterType === 'Perdas' && task.type === 'negative');
      const matchesLevel = filterLevel === 'Todos' || task.level === filterLevel;
      
      return matchesSearch && matchesCategory && matchesType && matchesLevel;
    });
  }, [tasks, searchQuery, filterCategory, filterType, filterLevel]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-base md:text-xl font-bold text-slate-900">Biblioteca de Tarefas</h3>
        <button onClick={() => { resetForm(); setIsAdding(true); }} className="bg-indigo-600 text-white px-3 py-2 md:px-4 md:py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-all text-xs md:text-sm">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nova Tarefa</span><span className="sm:hidden">Nova</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar por nome da tarefa..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select 
              value={filterCategory} 
              onChange={e => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Todas">Todas as Categorias</option>
              {TASK_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          <select 
            value={filterType} 
            onChange={e => setFilterType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="Todos">Todos os Tipos</option>
            <option value="Ganhos">Ganhos (Positivos)</option>
            <option value="Perdas">Perdas (Negativos)</option>
          </select>

          <select 
            value={filterLevel} 
            onChange={e => setFilterLevel(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="Todos">Todos os Níveis</option>
            <option value="leve">Leve</option>
            <option value="médio">Médio</option>
            <option value="grave">Grave</option>
          </select>
        </div>
      </div>

      {(isAdding || editingTask) && (
        <motion.form 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={editingTask ? handleUpdate : handleAdd} 
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4"
        >
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-bold text-slate-900">{editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}</h4>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="md:col-span-2 lg:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">Nome da Tarefa</label>
              <input value={name} onChange={e => setName(e.target.value)} required className="w-full px-4 py-2 rounded-lg border border-slate-200" placeholder="ex: Arrumar o Quarto" />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-200">
                {TASK_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
              <select value={type} onChange={e => setType(e.target.value as any)} className="w-full px-4 py-2 rounded-lg border border-slate-200">
                <option value="positive">Positivo (Recompensa)</option>
                <option value="negative">Negativo (Penalidade)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Valor (Moedas)</label>
              <input type="number" value={value} onChange={e => setValue(Number(e.target.value))} required className="w-full px-4 py-2 rounded-lg border border-slate-200" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nível</label>
              <select value={level} onChange={e => setLevel(e.target.value as any)} className="w-full px-4 py-2 rounded-lg border border-slate-200">
                <option value="leve">Leve</option>
                <option value="médio">Médio</option>
                <option value="grave">Grave</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input 
                type="checkbox" 
                id="recoverable" 
                checked={recoverable} 
                onChange={e => setRecoverable(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
              />
              <label htmlFor="recoverable" className="text-sm font-medium text-slate-700">Recuperável?</label>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <button type="button" onClick={resetForm} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg">Cancelar</button>
            <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium">
              {editingTask ? 'Atualizar' : 'Criar'}
            </button>
          </div>
        </motion.form>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tarefa</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Categoria</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Nível</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Valor</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Recup.</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTasks.map(task => (
                <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{task.name}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">{task.category}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                      task.type === 'positive' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    )}>
                      {task.type === 'positive' ? 'positivo' : 'negativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                      task.level === 'grave' ? "bg-red-50 text-red-600" : 
                      task.level === 'médio' ? "bg-amber-50 text-amber-600" : 
                      "bg-blue-50 text-blue-600"
                    )}>
                      {task.level || 'leve'}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-900">{task.value} moedas</td>
                  <td className="px-6 py-4">
                    {task.recoverable ? (
                      <span className="text-emerald-600 text-xs font-bold">Sim</span>
                    ) : (
                      <span className="text-slate-400 text-xs">Não</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {confirmDeleteId === task.id ? (
                        <div className="flex items-center gap-1 bg-rose-50 p-1 rounded-lg">
                          <span className="text-[10px] font-bold text-rose-600 px-1">Excluir?</span>
                          <button 
                            onClick={() => handleDelete(task.id)} 
                            className="px-2 py-1 bg-rose-500 text-white text-[10px] font-bold rounded uppercase"
                          >
                            Sim
                          </button>
                          <button 
                            onClick={() => setConfirmDeleteId(null)} 
                            className="px-2 py-1 bg-slate-200 text-slate-600 text-[10px] font-bold rounded uppercase"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => startEditing(task)} className="text-slate-400 hover:text-indigo-600 transition-colors">
                            <Settings className="w-5 h-5" />
                          </button>
                          <button onClick={() => setConfirmDeleteId(task.id)} className="text-slate-400 hover:text-rose-500 transition-colors">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredTasks.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500 italic font-medium">
                    Nenhuma tarefa encontrada com os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const HistoryView = ({ transactions, children, onRecover, onClear }: { transactions: Transaction[], children: Child[], onRecover: (t: Transaction) => void, onClear: () => void }) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<'all' | 'week' | 'month' | 'year'>('all');

  const filteredTransactions = useMemo(() => {
    if (periodFilter === 'all') return transactions;
    
    const now = new Date();
    const cutoff = new Date();
    
    if (periodFilter === 'week') cutoff.setDate(now.getDate() - 7);
    else if (periodFilter === 'month') cutoff.setMonth(now.getMonth() - 1);
    else if (periodFilter === 'year') cutoff.setFullYear(now.getFullYear() - 1);
    
    return transactions.filter(t => {
      if (!t.timestamp) return false;
      const date = t.timestamp instanceof Timestamp ? t.timestamp.toDate() : new Date(t.timestamp);
      return date >= cutoff;
    });
  }, [transactions, periodFilter]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-base md:text-lg font-bold text-slate-900">Histórico de Transações</h3>
            <p className="text-[10px] md:text-xs text-slate-500 mt-1">Exibindo {filteredTransactions.length} de {transactions.length} registros</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto">
              {(['all', 'week', 'month', 'year'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriodFilter(p)}
                  className={cn(
                    "px-2 md:px-3 py-1 md:py-1.5 text-[8px] md:text-[10px] font-bold uppercase rounded-lg transition-all whitespace-nowrap",
                    periodFilter === p 
                      ? "bg-white text-indigo-600 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {p === 'all' ? 'Tudo' : p === 'week' ? 'Semana' : p === 'month' ? 'Mês' : 'Ano'}
                </button>
              ))}
            </div>
            <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
            <button className="text-sm text-indigo-600 font-medium hover:underline">Exportar CSV</button>
            {transactions.length > 0 && (
              <button 
                onClick={() => setShowConfirm(true)}
                className="text-xs md:text-sm text-rose-600 font-medium hover:underline flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden sm:inline">Limpar</span>
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto -mx-4 md:mx-0">
          <table className="w-full text-left min-w-[600px] md:min-w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 md:px-6 py-4 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Data</th>
                <th className="px-4 md:px-6 py-4 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Criança</th>
                <th className="px-4 md:px-6 py-4 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Descrição</th>
                <th className="hidden md:table-cell px-6 py-4 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Tipo</th>
                <th className="px-4 md:px-6 py-4 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Valor</th>
                <th className="px-4 md:px-6 py-4 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.map(t => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 md:px-6 py-4 text-[10px] md:text-sm text-slate-500 whitespace-nowrap">{safeFormat(t.timestamp, 'd MMM, HH:mm')}</td>
                  <td className="px-4 md:px-6 py-4 text-xs md:text-sm font-medium text-slate-900">{children.find(c => c.id === t.childId)?.name}</td>
                  <td className="px-4 md:px-6 py-4 text-xs md:text-sm text-slate-600">
                    <div className="flex flex-col gap-1">
                      <span className="max-w-[120px] md:max-w-none">{t.description}</span>
                      <div className="flex flex-wrap gap-1">
                        <span className={cn(
                          "md:hidden px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase",
                          t.type === 'reward' ? "bg-emerald-50 text-emerald-600" : 
                          t.type === 'recovery' ? "bg-blue-50 text-blue-600" :
                          "bg-rose-50 text-rose-600"
                        )}>
                          {t.type === 'reward' ? 'recompensa' : t.type === 'recovery' ? 'recuperação' : 'penalidade'}
                        </span>
                        {t.isRecoverable && !t.recovered && (
                          <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 text-[8px] md:text-[10px] font-bold rounded border border-amber-100 uppercase">Recuperável</span>
                        )}
                        {t.recovered && (
                          <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[8px] md:text-[10px] font-bold rounded border border-emerald-100 uppercase">Recuperada</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                      t.type === 'reward' ? "bg-emerald-50 text-emerald-600" : 
                      t.type === 'recovery' ? "bg-blue-50 text-blue-600" :
                      "bg-rose-50 text-rose-600"
                    )}>
                      {t.type === 'reward' ? 'recompensa' : t.type === 'recovery' ? 'recuperação' : 'penalidade'}
                    </span>
                  </td>
                  <td className={cn("px-4 md:px-6 py-4 text-xs md:text-sm font-bold", t.type === 'penalty' ? "text-rose-600" : "text-emerald-600")}>
                    {t.type === 'penalty' ? '-' : '+'}{Math.abs(t.amount)}
                  </td>
                  <td className="px-4 md:px-6 py-4 text-right">
                    {t.type === 'penalty' && t.isRecoverable && !t.recovered && (
                      <button 
                        onClick={() => onRecover(t)}
                        className="text-[8px] md:text-[10px] font-bold uppercase bg-indigo-600 text-white px-2 py-1 md:px-3 md:py-1.5 rounded-lg hover:bg-indigo-700 transition-all flex items-center gap-1 ml-auto whitespace-nowrap"
                      >
                        <Trophy className="w-2.5 h-2.5 md:w-3 md:h-3" /> <span className="hidden sm:inline">Recuperar (50%)</span><span className="sm:hidden">Recuperar</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 italic">
                    {periodFilter === 'all' 
                      ? "Nenhuma transação encontrada no histórico." 
                      : `Nenhuma transação encontrada para o período: ${periodFilter === 'week' ? 'Semana' : periodFilter === 'month' ? 'Mês' : 'Ano'}.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden"
            >
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <History className="w-8 h-8 text-rose-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Limpar Histórico?</h3>
                <p className="text-slate-500 mb-6">
                  Isso apagará permanentemente todas as transações visíveis. Os saldos das crianças não serão alterados.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowConfirm(false)}
                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => {
                      onClear();
                      setShowConfirm(false);
                    }}
                    className="flex-1 px-6 py-3 bg-rose-600 text-white font-bold rounded-2xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-100"
                  >
                    Sim, Limpar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AnalyticsView = ({ transactions, children }: { transactions: Transaction[], children: Child[] }) => {
  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return format(d, 'd MMM');
    }).reverse();

    return last7Days.map(day => {
      const dayTxs = transactions.filter(t => t.timestamp && safeFormat(t.timestamp, 'd MMM') === day);
      return {
        name: day,
        ganhos: dayTxs.filter(t => t.type === 'reward').reduce((acc, t) => acc + t.amount, 0),
        penalidades: Math.abs(dayTxs.filter(t => t.type === 'penalty').reduce((acc, t) => acc + t.amount, 0))
      };
    });
  }, [transactions]);

  const distributionData = useMemo(() => {
    return children.map(c => ({
      name: c.name,
      value: c.balance
    }));
  }, [children]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Ganhos vs Penalidades (Últimos 7 Dias)</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="ganhos" fill="#10b981" radius={[4, 4, 0, 0]} name="Ganhos" />
                <Bar dataKey="penalidades" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Penalidades" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Distribuição de Saldo</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#4f46e5', '#10b981', '#f59e0b', '#8b5cf6'][index % 4]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-4">
            {distributionData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#8b5cf6'][index % 4] }}></div>
                <span className="text-xs font-medium text-slate-600">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const ChildView = ({ child, tasks, transactions, notifications, family, onBack }: { child: Child, tasks: Task[], transactions: Transaction[], notifications: Notification[], family: Family | null, onBack: () => void }) => {
  const [taskTab, setTaskTab] = useState<'earn' | 'lose'>('earn');
  const dailyGain = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return transactions
      .filter(t => {
        const tDate = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
        return (t.type === 'reward' || t.type === 'recovery') && tDate >= todayStart;
      })
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  const monthlyGain = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return transactions
      .filter(t => {
        const tDate = t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
        return (t.type === 'reward' || t.type === 'recovery') && tDate >= thirtyDaysAgo;
      })
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  const nextLevelPoints = pointsForNextLevel(child.level);
  const progressToNext = ((child.points - pointsForNextLevel(child.level - 1)) / (nextLevelPoints - pointsForNextLevel(child.level - 1))) * 100;

  const positiveTasks = tasks.filter(t => t.type === 'positive');
  const negativeTasks = tasks.filter(t => t.type === 'negative');

  const getCategoryStyle = (category: string) => {
    const styles: Record<string, { icon: any, color: string, bg: string }> = {
      'Responsabilidades Domésticas': { icon: Home, color: 'text-blue-600', bg: 'bg-blue-50' },
      'Estudos e Desenvolvimento Intelectual': { icon: BookOpen, color: 'text-indigo-600', bg: 'bg-indigo-50' },
      'Hábitos Saudáveis': { icon: Heart, color: 'text-rose-600', bg: 'bg-rose-50' },
      'Comportamento e Atitudes': { icon: Smile, color: 'text-amber-600', bg: 'bg-amber-50' },
      'Autonomia e Responsabilidade Pessoal': { icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
      'Criatividade e Lazer Produtivo': { icon: Palette, color: 'text-purple-600', bg: 'bg-purple-50' },
      'Desafios e Missões Especiais': { icon: Rocket, color: 'text-orange-600', bg: 'bg-orange-50' }
    };
    return styles[category] || { icon: Star, color: 'text-slate-600', bg: 'bg-slate-50' };
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-600 font-medium hover:text-indigo-600 transition-colors">
          <ArrowLeft className="w-5 h-5" /> Voltar para os Pais
        </button>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-bold text-slate-900">{child.name}</p>
            <p className="text-xs text-slate-500">Nível {child.level}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border-2 overflow-hidden" style={{ borderColor: child.themeColor }}>
            {child.avatarUrl ? (
              <img src={child.avatarUrl} alt={child.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <Users className="w-5 h-5 text-slate-400" />
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-8">
        {/* Limites de Moedas Notice */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Info className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-indigo-900">Atenção aos seus limites!</p>
            <p className="text-xs text-indigo-700">
              Você pode ganhar até <span className="font-bold">+{child.dailyGoal || 10} moedas</span> por dia e até <span className="font-bold">{child.monthlyGoal} moedas</span> por mês.
            </p>
          </div>
        </div>

        {/* Hero Section */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 text-center relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-2" style={{ backgroundColor: child.themeColor }}></div>
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-indigo-50 flex items-center justify-center overflow-hidden border-4 border-white shadow-lg">
                {child.avatarUrl ? (
                  <img src={child.avatarUrl} alt={child.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <Coins className="w-12 h-12 text-indigo-600" />
                )}
              </div>
              <motion.div 
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute -top-2 -right-2 bg-amber-400 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-lg"
              >
                {child.balance}
              </motion.div>
            </div>
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-2">Meu Saldo</h2>
          {family?.coinToRealRate !== undefined && family.coinToRealRate > 0 && (
            <div className="inline-flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-100 mb-4">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span className="text-lg font-bold text-emerald-700">
                R$ {(child.balance * family.coinToRealRate).toFixed(2).replace('.', ',')}
              </span>
            </div>
          )}
          <p className="text-slate-500 font-medium mb-8">Você está indo muito bem, {child.name}!</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ganho Hoje</p>
              <p className="text-xl font-bold text-slate-900">{dailyGain} / {child.dailyGoal || 10}</p>
              {family?.coinToRealRate !== undefined && family.coinToRealRate > 0 && (
                <p className="text-[10px] font-bold text-emerald-600 uppercase mt-1">
                  R$ {(dailyGain * family.coinToRealRate).toFixed(2).replace('.', ',')}
                </p>
              )}
              <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className={cn("h-full transition-all duration-500", dailyGain >= (child.dailyGoal || 10) ? "bg-amber-500" : "bg-emerald-500")} 
                  style={{ width: `${Math.min((dailyGain / (child.dailyGoal || 10)) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ganho Mensal</p>
              <p className="text-xl font-bold text-slate-900">{monthlyGain} / {child.monthlyGoal}</p>
              {family?.coinToRealRate !== undefined && family.coinToRealRate > 0 && (
                <p className="text-[10px] font-bold text-emerald-600 uppercase mt-1">
                  R$ {(monthlyGain * family.coinToRealRate).toFixed(2).replace('.', ',')}
                </p>
              )}
              <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className={cn("h-full transition-all duration-500", monthlyGain >= child.monthlyGoal ? "bg-amber-500" : "bg-indigo-500")} 
                  style={{ width: `${Math.min((monthlyGain / child.monthlyGoal) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Meta Mensal</p>
              <p className="text-xl font-bold text-slate-900">{child.balance} / {child.monthlyGoal}</p>
              {family?.coinToRealRate !== undefined && family.coinToRealRate > 0 && (
                <p className="text-[10px] font-bold text-emerald-600 uppercase mt-1">
                  R$ {(child.balance * family.coinToRealRate).toFixed(2).replace('.', ',')}
                </p>
              )}
              <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${Math.min((child.balance / child.monthlyGoal) * 100, 100)}%` }}></div>
              </div>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Progresso de Nível</p>
              <p className="text-xl font-bold text-slate-900">Nível {child.level}</p>
              <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: `${progressToNext}%` }}></div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tasks Toggle Section */}
        <div className="space-y-6">
          <div className="flex p-1.5 bg-slate-100 rounded-2xl">
            <button 
              onClick={() => setTaskTab('earn')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all",
                taskTab === 'earn' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <PlusCircle className="w-4 h-4" />
              Como Ganhar
            </button>
            <button 
              onClick={() => setTaskTab('lose')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all",
                taskTab === 'lose' ? "bg-white text-rose-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <MinusCircle className="w-4 h-4" />
              Evitar Perder
            </button>
          </div>

          <AnimatePresence mode="wait">
            {taskTab === 'earn' ? (
              <motion.div 
                key="earn"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                {positiveTasks.map(task => {
                  const style = getCategoryStyle(task.category);
                  const Icon = style.icon;
                  return (
                    <motion.div 
                      key={task.id} 
                      whileTap={{ scale: 0.98 }}
                      className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3"
                    >
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", style.bg, style.color)}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 text-sm leading-tight">{task.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium truncate">{task.category}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-lg font-black text-emerald-600">+{task.value}</span>
                        <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">moedas</p>
                      </div>
                    </motion.div>
                  );
                })}
                {positiveTasks.length === 0 && (
                  <div className="bg-slate-50 p-8 rounded-2xl border border-dashed border-slate-200 text-center">
                    <p className="text-slate-500 text-sm font-medium">Nenhuma atividade cadastrada.</p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="lose"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                {negativeTasks.map(task => {
                  const style = getCategoryStyle(task.category);
                  const Icon = style.icon;
                  return (
                    <motion.div 
                      key={task.id} 
                      whileTap={{ scale: 0.98 }}
                      className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", style.bg, style.color)}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 text-sm leading-tight">{task.name}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] text-slate-400 font-medium truncate">{task.category}</p>
                            <span className={cn(
                              "text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-tighter",
                              task.level === 'grave' ? "bg-rose-100 text-rose-600" : 
                              task.level === 'médio' ? "bg-amber-100 text-amber-600" : 
                              "bg-slate-100 text-slate-600"
                            )}>
                              {task.level}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-lg font-black text-rose-600">-{task.value}</span>
                          <p className="text-[9px] font-bold text-rose-500 uppercase tracking-tighter">moedas</p>
                        </div>
                      </div>
                      
                      {task.recoverable && (
                        <div className="bg-amber-50 rounded-xl p-2 flex items-center gap-2">
                          <RotateCcw className="w-3 h-3 text-amber-600 flex-shrink-0" />
                          <p className="text-[10px] text-amber-800 font-medium">
                            Recupere 50% se pedir desculpas ou reparar o dano!
                          </p>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
                {negativeTasks.length === 0 && (
                  <div className="bg-slate-50 p-8 rounded-2xl border border-dashed border-slate-200 text-center">
                    <p className="text-slate-500 text-sm font-medium">Parabéns! Sem penalidades.</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Notifications */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-indigo-600" />
            Atualizações Recentes
          </h3>
          <div className="space-y-3">
            {notifications.slice(0, 3).map(n => (
              <motion.div 
                key={n.id}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className={cn(
                  "p-4 rounded-2xl border flex items-center gap-4 shadow-sm",
                  n.type === 'success' ? "bg-emerald-50 border-emerald-100" : 
                  n.type === 'warning' ? "bg-rose-50 border-rose-100" : 
                  "bg-indigo-50 border-indigo-100"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  n.type === 'success' ? "bg-emerald-200 text-emerald-700" : 
                  n.type === 'warning' ? "bg-rose-200 text-rose-700" : 
                  "bg-indigo-200 text-indigo-700"
                )}>
                  {n.type === 'success' ? <CheckCircle2 /> : n.type === 'warning' ? <AlertCircle /> : <Award />}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-900">{n.message}</p>
                  <p className="text-xs text-slate-500">{safeFormat(n.timestamp, 'd MMM, HH:mm')}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Badges */}
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Award className="w-6 h-6 text-amber-500" />
            Minhas Conquistas
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {BADGES.map(badge => {
              const earned = badge.condition(child);
              return (
                <div key={badge.id} className={cn(
                  "p-4 rounded-2xl border text-center transition-all",
                  earned ? "bg-white border-slate-100 shadow-md" : "bg-slate-100 border-transparent opacity-50 grayscale"
                )}>
                  <div className="mb-2 flex justify-center">{badge.icon}</div>
                  <p className="font-bold text-slate-900 text-sm">{badge.name}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{badge.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* History */}
        <div className="space-y-4 pb-12">
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <History className="w-6 h-6 text-slate-600" />
            Registro de Atividades
          </h3>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-50">
            {transactions.slice(0, 10).map(t => (
              <div key={t.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900">{t.description}</p>
                  <p className="text-xs text-slate-500">{safeFormat(t.timestamp, 'd MMM, HH:mm')}</p>
                </div>
                <span className={cn("font-black text-lg", t.type === 'reward' ? "text-emerald-500" : "text-rose-500")}>
                  {t.type === 'reward' ? '+' : ''}{t.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  );
}
