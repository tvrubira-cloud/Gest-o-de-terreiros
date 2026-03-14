import { useState, useEffect, useRef } from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updatePassword,
  getAuth,
  User as FirebaseUser,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc,
  onSnapshot, 
  collection, 
  query, 
  orderBy,
  where,
  getDocs,
  updateDoc 
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { callGeminiWithRetry, callGeminiStreamWithRetry } from './services/geminiService';
import Markdown from 'react-markdown';
import { 
  LogOut, 
  Calendar, 
  Users, 
  Settings as SettingsIcon, 
  User as UserIcon, 
  Camera,
  Home,
  Plus,
  Bell,
  Search,
  Music,
  Leaf,
  Play,
  Pause,
  Volume2,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  Send,
  Loader2,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type UserRole = 'admin' | 'member';

interface TerreiroSettings {
  terreiroName: string;
  logoUrl: string;
  welcomeMessage: string;
}

interface UserProfile {
  uid: string;
  cpf: string;
  role: UserRole;
  fullName: string;
  photoUrl?: string;
  spiritualName?: string;
  birthDate?: string;
  rg?: string;
  authLinked?: boolean;
  address?: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
  contacts?: {
    phone: string;
    whatsapp: string;
    email: string;
  };
  profession?: string;
  parents?: string;
  spiritualData?: {
    timeInUmbanda?: string;
    previousReligion?: string;
    orixaHead?: string;
    orixaAdjunto?: string;
    mediumType?: string;
    chefeCoroa?: string;
    orixas?: string;
    entities?: string;
    previousPaiMae?: string;
    entryDate?: string;
    obligationsHistory?: string;
  };
}

interface TerreiroEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  type: 'gira' | 'festa' | 'obrigacao' | 'reuniao' | 'outro';
  createdBy: string;
  imageUrl?: string;
}

// --- Components ---

const Button = ({ className, variant = 'primary', ...props }: any) => {
  const variants = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
    secondary: 'bg-white text-emerald-900 border border-emerald-200 hover:bg-emerald-50',
    ghost: 'text-emerald-700 hover:bg-emerald-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  return (
    <button 
      className={cn('px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50', variants[variant as keyof typeof variants], className)} 
      {...props} 
    />
  );
};

const Input = ({ label, error, ...props }: any) => (
  <div className="space-y-1">
    {label && <label className="text-sm font-medium text-emerald-900">{label}</label>}
    <input 
      className={cn(
        "w-full px-4 py-2 rounded-lg border border-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all",
        error && "border-red-500"
      )} 
      {...props} 
    />
    {error && <p className="text-xs text-red-500">{error}</p>}
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<TerreiroSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'agenda' | 'profile' | 'admin-members' | 'admin-events' | 'admin-settings' | 'ai-assistant' | 'pontos' | 'herb-guide'>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [events, setEvents] = useState<TerreiroEvent[]>([]);
  const [showCpfModal, setShowCpfModal] = useState(false);
  const [cpfInput, setCpfInput] = useState('');
  const [loginCpf, setLoginCpf] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (profileDoc.exists()) {
            setProfile(profileDoc.data() as UserProfile);
          } else {
            setShowCpfModal(true);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    // Listen to settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (doc) => {
      if (doc.exists()) {
        setSettings(doc.data() as TerreiroSettings);
      } else {
        setSettings({
          terreiroName: 'Terreiro de Umbanda',
          logoUrl: 'https://picsum.photos/seed/terreiro/200',
          welcomeMessage: 'Bem-vindo à nossa casa espiritual.'
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
    });

    // Listen to events
    const q = query(collection(db, 'events'), orderBy('date', 'asc'));
    const unsubEvents = onSnapshot(q, (snapshot) => {
      const evs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TerreiroEvent));
      setEvents(evs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'events');
    });

    return () => {
      unsubscribe();
      unsubSettings();
      unsubEvents();
    };
  }, []);

  const [showFirstAccess, setShowFirstAccess] = useState(false);
  const [firstAccessData, setFirstAccessData] = useState({ cpf: '', password: '', confirmPassword: '' });
  const [isRegistering, setIsRegistering] = useState(false);

  const handleFirstAccess = async () => {
    if (!firstAccessData.cpf || !firstAccessData.password) {
      setLoginError('Preencha CPF e senha.');
      return;
    }
    if (firstAccessData.password !== firstAccessData.confirmPassword) {
      setLoginError('As senhas não coincidem.');
      return;
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(firstAccessData.password)) {
      setLoginError('A senha deve ter no mínimo 8 caracteres, incluindo letras maiúsculas, minúsculas e números.');
      return;
    }

    setIsRegistering(true);
    setLoginError('');

    const cleanCpf = firstAccessData.cpf.replace(/\D/g, '');
    const email = `${cleanCpf}@terreiro.app`;

    try {
      // 1. Check if member exists in Firestore by CPF
      const q = query(collection(db, 'users'), where('cpf', '==', firstAccessData.cpf));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setLoginError('CPF não encontrado no cadastro da casa. Peça ao administrador para cadastrar seu CPF primeiro.');
        setIsRegistering(false);
        return;
      }

      const memberDoc = querySnapshot.docs[0];
      const memberData = memberDoc.data();

      if (memberData.authLinked) {
        setLoginError('Este CPF já possui acesso cadastrado. Use a tela de login normal.');
        setIsRegistering(false);
        return;
      }

      // 2. Create Auth User
      const userCredential = await createUserWithEmailAndPassword(auth, email, firstAccessData.password);
      const uid = userCredential.user.uid;

      // 3. Update Firestore doc with new UID and link flag
      await updateDoc(doc(db, 'users', memberDoc.id), {
        uid: uid,
        authLinked: true,
        updatedAt: new Date().toISOString()
      });

      alert('Acesso criado com sucesso! Você já está logado.');
      setShowFirstAccess(false);
    } catch (error: any) {
      console.error('First access error:', error);
      if (error.code === 'auth/email-already-in-use') {
        setLoginError('Este CPF já possui acesso cadastrado.');
      } else if (error.code === 'auth/operation-not-allowed') {
        setLoginError('O provedor "E-mail/Senha" está desativado no Firebase. Ative-o em Authentication > Sign-in method no Console do Firebase.');
      } else {
        setLoginError('Erro ao criar acesso: ' + error.message);
      }
    } finally {
      setIsRegistering(false);
    }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    setLoginError('');
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/unauthorized-domain') {
        setLoginError('Este domínio não está autorizado para login no Firebase. Adicione o domínio atual aos Domínios Autorizados no Console do Firebase.');
      } else if (error.code === 'auth/operation-not-allowed') {
        setLoginError('O provedor "Google" está desativado no Firebase. Ative-o em Authentication > Sign-in method no Console do Firebase.');
      } else {
        setLoginError('Erro ao entrar com Google. Tente novamente.');
      }
    }
  };

  const handleCpfLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!loginCpf || !loginPassword) {
      setLoginError('Por favor, preencha CPF e senha.');
      return;
    }

    const cleanCpf = loginCpf.replace(/\D/g, '');
    const email = `${cleanCpf}@terreiro.app`;

    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, loginPassword);
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setLoginError('CPF ou senha incorretos.');
      } else if (error.code === 'auth/operation-not-allowed') {
        setLoginError('O provedor "E-mail/Senha" está desativado no Firebase. Ative-o em Authentication > Sign-in method no Console do Firebase.');
      } else {
        setLoginError('Erro ao fazer login. Tente novamente.');
      }
    }
  };

  const handleLogout = () => signOut(auth);

  const handleCpfSubmit = async () => {
    if (!user || !cpfInput) return;
    const isDefaultAdmin = user.email === 'tvrubira@gmail.com';
    const newProfile: UserProfile = {
      uid: user.uid,
      cpf: cpfInput,
      role: isDefaultAdmin ? 'admin' : 'member',
      fullName: user.displayName || '',
      contacts: {
        email: user.email || '',
        phone: '',
        whatsapp: ''
      }
    };

    try {
      await setDoc(doc(db, 'users', user.uid), newProfile);
      setProfile(newProfile);
      setShowCpfModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-emerald-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden"
        >
          <div className="p-8 text-center space-y-6">
            <div className="w-24 h-24 mx-auto rounded-full overflow-hidden border-4 border-emerald-100 shadow-inner">
              <img 
                src="https://ais-pre-4pa6kzxwli2xaoq5f27lox-259265820664.us-west2.run.app/logo.png" 
                alt="Logo" 
                className="w-full h-full object-cover"
                onError={(e: any) => e.target.src = 'https://picsum.photos/seed/spiritual/200'}
              />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-serif font-bold text-emerald-900">Gestão de Terreiro</h1>
              <p className="text-emerald-600 text-sm font-medium">Acesse com seu CPF e senha</p>
            </div>

            <form onSubmit={handleCpfLogin} className="space-y-4 text-left">
              <Input 
                label="CPF" 
                placeholder="000.000.000-00" 
                value={loginCpf}
                onChange={(e: any) => setLoginCpf(e.target.value)}
              />
              <Input 
                label="Senha" 
                type="password" 
                placeholder="••••••••" 
                value={loginPassword}
                onChange={(e: any) => setLoginPassword(e.target.value)}
              />
              <label className="flex items-center gap-2 text-sm text-emerald-600">
                <input 
                  type="checkbox" 
                  checked={rememberMe} 
                  onChange={(e) => setRememberMe(e.target.checked)} 
                  className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                />
                Lembrar-me
              </label>
              {loginError && <p className="text-xs text-red-500">{loginError}</p>}
              <Button type="submit" className="w-full py-3">Entrar</Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-emerald-100"></span></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-emerald-400">Acesso</span></div>
            </div>

            <div className="flex flex-col gap-3">
              <Button 
                variant="ghost" 
                onClick={() => setShowFirstAccess(true)}
                className="text-emerald-600 font-bold py-3"
              >
                Primeiro Acesso? Cadastre sua senha
              </Button>
              <Button variant="secondary" onClick={handleLogin} className="w-full py-3 flex items-center justify-center gap-2">
                <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                Entrar com Google
              </Button>
            </div>

            {showFirstAccess && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xl font-bold text-emerald-900">Primeiro Acesso</h4>
                    <button onClick={() => setShowFirstAccess(false)} className="text-emerald-400 hover:text-emerald-600">
                      <X size={24} />
                    </button>
                  </div>
                  <p className="text-sm text-emerald-600 text-left">Informe seu CPF cadastrado na casa para criar sua senha de acesso.</p>
                  
                  <div className="space-y-4 text-left">
                    <Input 
                      label="CPF" 
                      placeholder="000.000.000-00" 
                      value={firstAccessData.cpf}
                      onChange={(e: any) => setFirstAccessData({...firstAccessData, cpf: e.target.value})}
                    />
                    <Input 
                      label="Nova Senha" 
                      type="password" 
                      placeholder="Mínimo 8 caracteres, letras e números" 
                      value={firstAccessData.password}
                      onChange={(e: any) => setFirstAccessData({...firstAccessData, password: e.target.value})}
                    />
                    <Input 
                      label="Confirmar Senha" 
                      type="password" 
                      placeholder="Repita a senha" 
                      value={firstAccessData.confirmPassword}
                      onChange={(e: any) => setFirstAccessData({...firstAccessData, confirmPassword: e.target.value})}
                    />
                  </div>

                  {loginError && <p className="text-xs text-red-500 bg-red-50 p-3 rounded-lg">{loginError}</p>}

                  <div className="flex gap-3">
                    <Button variant="ghost" onClick={() => setShowFirstAccess(false)} className="flex-1">Cancelar</Button>
                    <Button onClick={handleFirstAccess} disabled={isRegistering} className="flex-1">
                      {isRegistering ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'Criar Acesso'}
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}
            <p className="text-xs text-emerald-400">Administradores podem criar novos acessos.</p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (showCpfModal) {
    return (
      <div className="min-h-screen bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl"
        >
          <h2 className="text-2xl font-bold text-emerald-900 mb-4">Finalizar Cadastro</h2>
          <p className="text-emerald-600 mb-6">Para continuar, informe seu CPF. Ele será seu identificador único na casa.</p>
          <Input 
            label="CPF" 
            placeholder="000.000.000-00" 
            value={cpfInput} 
            onChange={(e: any) => setCpfInput(e.target.value)}
          />
          <Button onClick={handleCpfSubmit} className="w-full mt-6">Confirmar</Button>
        </motion.div>
      </div>
    );
  }

  const isAdmin = profile?.role === 'admin';

  const handleResetAccess = async (member: UserProfile) => {
    if (!window.confirm(`Deseja resetar o acesso de ${member.fullName}? Ele precisará cadastrar uma nova senha no Primeiro Acesso.`)) return;
    
    try {
      // Find the document ID (it might be the UID or a random ID)
      const q = query(collection(db, 'users'), where('uid', '==', member.uid));
      const snap = await getDocs(q);
      if (snap.empty) return;

      await updateDoc(doc(db, 'users', snap.docs[0].id), {
        authLinked: false,
        updatedAt: new Date().toISOString()
      });

      alert('Acesso resetado! O membro já pode usar a opção "Primeiro Acesso" para criar uma nova senha.');
    } catch (error: any) {
      alert('Erro ao resetar acesso: ' + error.message);
    }
  };

  const handleNavClick = (newView: any) => {
    setView(newView);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#f9f9f7] flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden bg-white border-b border-emerald-100 p-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-2 text-emerald-900"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center overflow-hidden">
              <img src={settings?.logoUrl} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-emerald-900 truncate max-w-[150px]">{settings?.terreiroName}</span>
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-emerald-200 border-2 border-white shadow-sm overflow-hidden">
          <img src={user.photoURL || ''} alt="User" />
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 md:hidden"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-white z-50 md:hidden flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-emerald-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center overflow-hidden">
                    <img src={settings?.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                  </div>
                  <span className="font-bold text-emerald-900">{settings?.terreiroName}</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="text-emerald-400">
                  <X size={24} />
                </button>
              </div>
              
              <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                <NavItem active={view === 'dashboard'} icon={<Home size={20} />} label="Início" onClick={() => handleNavClick('dashboard')} />
                <NavItem active={view === 'agenda'} icon={<Calendar size={20} />} label="Agenda" onClick={() => handleNavClick('agenda')} />
                <NavItem active={view === 'pontos'} icon={<Music size={20} />} label="Pontos Cantados" onClick={() => handleNavClick('pontos')} />
                <NavItem active={view === 'herb-guide'} icon={<Leaf size={20} />} label="Guia de Ervas" onClick={() => handleNavClick('herb-guide')} />
                <NavItem active={view === 'ai-assistant'} icon={<Sparkles size={20} />} label="Assistente IA" onClick={() => handleNavClick('ai-assistant')} />
                <NavItem active={view === 'profile'} icon={<UserIcon size={20} />} label="Meu Perfil" onClick={() => handleNavClick('profile')} />
                
                {isAdmin && (
                  <div className="pt-6">
                    <p className="px-4 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">Administração</p>
                    <NavItem active={view === 'admin-members'} icon={<Users size={20} />} label="Membros" onClick={() => handleNavClick('admin-members')} />
                    <NavItem active={view === 'admin-events'} icon={<Plus size={20} />} label="Gerenciar Agenda" onClick={() => handleNavClick('admin-events')} />
                    <NavItem active={view === 'admin-settings'} icon={<SettingsIcon size={20} />} label="Configurações" onClick={() => handleNavClick('admin-settings')} />
                  </div>
                )}
              </nav>

              <div className="p-4 border-t border-emerald-50">
                <button 
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                >
                  <LogOut size={20} />
                  <span className="font-medium">Sair</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="w-64 bg-white border-r border-emerald-100 hidden md:flex flex-col sticky top-0 h-screen">
        <div className="p-6 border-b border-emerald-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center overflow-hidden">
              <img src={settings?.logoUrl} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-emerald-900 truncate">{settings?.terreiroName}</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <NavItem active={view === 'dashboard'} icon={<Home size={20} />} label="Início" onClick={() => handleNavClick('dashboard')} />
          <NavItem active={view === 'agenda'} icon={<Calendar size={20} />} label="Agenda" onClick={() => handleNavClick('agenda')} />
          <NavItem active={view === 'pontos'} icon={<Music size={20} />} label="Pontos Cantados" onClick={() => handleNavClick('pontos')} />
          <NavItem active={view === 'herb-guide'} icon={<Leaf size={20} />} label="Guia de Ervas" onClick={() => handleNavClick('herb-guide')} />
          <NavItem active={view === 'ai-assistant'} icon={<Sparkles size={20} />} label="Assistente IA" onClick={() => handleNavClick('ai-assistant')} />
          <NavItem active={view === 'profile'} icon={<UserIcon size={20} />} label="Meu Perfil" onClick={() => handleNavClick('profile')} />
          
          {isAdmin && (
            <div className="pt-6">
              <p className="px-4 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">Administração</p>
              <NavItem active={view === 'admin-members'} icon={<Users size={20} />} label="Membros" onClick={() => handleNavClick('admin-members')} />
              <NavItem active={view === 'admin-events'} icon={<Plus size={20} />} label="Gerenciar Agenda" onClick={() => handleNavClick('admin-events')} />
              <NavItem active={view === 'admin-settings'} icon={<SettingsIcon size={20} />} label="Configurações" onClick={() => handleNavClick('admin-settings')} />
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-emerald-50">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
          >
            <LogOut size={20} />
            <span className="font-medium">Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0">
        {/* Desktop Header */}
        <header className="bg-white border-b border-emerald-100 p-4 hidden md:flex items-center justify-between sticky top-0 z-30">
          <h2 className="text-xl font-bold text-emerald-900 capitalize">
            {view.replace('admin-', 'Admin: ').replace('-', ' ')}
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full text-emerald-700 text-sm font-medium">
              <ShieldCheck size={16} />
              {isAdmin ? 'Administrador' : 'Membro'}
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-200 border-2 border-white shadow-sm overflow-hidden">
              <img src={user.photoURL || ''} alt="User" />
            </div>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 p-4 md:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {view === 'dashboard' && <Dashboard profile={profile} settings={settings} events={events} />}
              {view === 'agenda' && <AgendaView events={events} />}
              {view === 'pontos' && <PontoLibraryView />}
              {view === 'herb-guide' && <HerbGuideView profile={profile} />}
              {view === 'ai-assistant' && <AIAssistantView profile={profile} settings={settings} />}
              {view === 'profile' && <ProfileView profile={profile} onUpdate={setProfile} />}
              {view === 'admin-members' && <AdminMembersView onResetAccess={handleResetAccess} />}
              {view === 'admin-events' && <AdminEventsView events={events} />}
              {view === 'admin-settings' && <AdminSettingsView settings={settings} onUpdate={setSettings} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavItem({ active, icon, label, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all font-medium",
        active ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" : "text-emerald-700 hover:bg-emerald-50"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// --- Sub-Views ---

function Dashboard({ profile, settings, events }: { profile: UserProfile | null, settings: TerreiroSettings | null, events: TerreiroEvent[] }) {
  const nextEvents = events.filter(e => new Date(e.date) >= new Date()).slice(0, 3);
  const [dailyMessage, setDailyMessage] = useState<string>('');
  const [doctrine, setDoctrine] = useState<{ title: string, content: string } | null>(null);
  const [forecast, setForecast] = useState<string>('');
  const [loadingAI, setLoadingAI] = useState(false);

  useEffect(() => {
    const fetchAIContent = async () => {
      if (!profile) return;
      setLoadingAI(true);
      try {
        // Fetch Daily Message
        const msgResponse = await callGeminiWithRetry({
          model: "gemini-3-flash-preview",
          contents: `Gere uma mensagem curta de sabedoria ou um "Axé do dia" para um membro de um terreiro de Umbanda. 
          O membro se chama ${profile.fullName} e tem como Orixá de cabeça ${profile.spiritualData?.orixaHead || 'não informado'}. 
          A mensagem deve ser inspiradora, respeitosa e ter no máximo 280 caracteres.`,
        });
        setDailyMessage(msgResponse.text);

        // Fetch Doctrine of the Day
        const doctrineResponse = await callGeminiWithRetry({
          model: "gemini-3-flash-preview",
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: { type: Type.STRING }
              },
              required: ["title", "content"]
            }
          },
          contents: `Gere um pequeno texto de estudo doutrinário sobre um tema da Umbanda (ex: as sete linhas, o papel do cambono, a importância do amaci, etc). 
          O tema deve ser educativo e respeitoso. Retorne um título e um parágrafo explicativo.`,
        });
        const doctrineData = JSON.parse(doctrineResponse.text);
        setDoctrine(doctrineData);

        // Fetch Weekly Forecast
        const forecastResponse = await callGeminiWithRetry({
          model: "gemini-3-flash-preview",
          contents: `Gere uma breve "Previsão Espiritual" para a semana para um membro de Umbanda.
          Orixá de cabeça: ${profile.spiritualData?.orixaHead || 'não informado'}.
          A previsão deve ser focada em equilíbrio, axé e recomendações de postura espiritual. Máximo 300 caracteres.`,
        });
        setForecast(forecastResponse.text);
      } catch (error: any) {
        console.error('AI Error:', error);
        setDailyMessage("Não foi possível carregar a mensagem do dia. Tente novamente mais tarde.");
      } finally {
        setLoadingAI(false);
      }
    };
    fetchAIContent();
  }, [profile]);

  return (
    <div className="space-y-8">
      <div className="bg-emerald-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-6">
          {profile?.photoUrl ? (
            <img src={profile.photoUrl} alt={profile.fullName} className="w-24 h-24 rounded-2xl object-cover border-2 border-white/20 shadow-lg" />
          ) : (
            <div className="w-24 h-24 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border-2 border-white/20 shadow-lg">
              <UserIcon size={40} className="text-emerald-300" />
            </div>
          )}
          <div className="space-y-4 flex-1">
            <div className="space-y-2">
              <h1 className="text-3xl font-serif font-bold">Bem-vindo(a), {profile?.fullName.split(' ')[0]}!</h1>
              <p className="text-emerald-100 text-lg opacity-90">{settings?.welcomeMessage}</p>
            </div>
            
            {dailyMessage && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 max-w-2xl"
              >
                <div className="flex items-center gap-2 mb-2 text-emerald-300">
                  <Sparkles size={16} />
                  <span className="text-xs font-bold uppercase tracking-wider">Mensagem do Dia</span>
                </div>
                <p className="text-sm italic leading-relaxed">"{dailyMessage}"</p>
              </motion.div>
            )}
            {loadingAI && !dailyMessage && (
              <div className="flex items-center gap-2 text-emerald-300 text-xs animate-pulse">
                <Loader2 size={14} className="animate-spin" />
                Buscando seu Axé do dia...
              </div>
            )}
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-800 rounded-full -mr-20 -mt-20 opacity-20 blur-3xl"></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {doctrine && (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white p-6 md:p-8 rounded-3xl border border-emerald-100 shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4 text-emerald-600">
                <div className="p-2 bg-emerald-50 rounded-lg w-fit">
                  <Sparkles size={20} />
                </div>
                <h3 className="text-xl font-bold">Estudo da Semana: {doctrine.title}</h3>
              </div>
              <p className="text-emerald-900 leading-relaxed text-lg">
                {doctrine.content}
              </p>
            </motion.div>
          )}

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-emerald-900">Próximos Eventos</h3>
              <button className="text-emerald-600 font-medium hover:underline">Ver todos</button>
            </div>
            <div className="grid gap-4">
              {nextEvents.length > 0 ? nextEvents.map(event => (
                <div key={event.id} className="bg-white p-4 md:p-6 rounded-2xl border border-emerald-50 flex items-center gap-4 md:gap-6 hover:shadow-md transition-all group">
                  {event.imageUrl ? (
                    <img src={event.imageUrl} alt={event.title} className="w-12 h-12 md:w-16 md:h-16 rounded-2xl object-cover" />
                  ) : (
                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-emerald-50 flex flex-col items-center justify-center text-emerald-700 shrink-0">
                      <span className="text-[10px] md:text-xs font-bold uppercase">{format(new Date(event.date), 'MMM', { locale: ptBR })}</span>
                      <span className="text-xl md:text-2xl font-bold leading-none">{format(new Date(event.date), 'dd')}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                        event.type === 'gira' ? "bg-blue-100 text-blue-700" : 
                        event.type === 'festa' ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"
                      )}>
                        {event.type}
                      </span>
                      <span className="text-emerald-400 text-sm">•</span>
                      <span className="text-emerald-500 text-sm font-medium">{format(new Date(event.date), 'HH:mm')}</span>
                    </div>
                    <h4 className="text-base md:text-lg font-bold text-emerald-900 group-hover:text-emerald-700 transition-colors truncate">{event.title}</h4>
                  </div>
                  <ChevronRight className="text-emerald-200 group-hover:text-emerald-400 transition-all shrink-0" />
                </div>
              )) : (
                <div className="bg-white p-8 rounded-2xl border border-dashed border-emerald-200 text-center text-emerald-400">
                  Nenhum evento agendado.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Weekly Forecast Card */}
          {forecast && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm space-y-4"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-emerald-900 flex items-center gap-2">
                  <Calendar className="text-emerald-500" size={18} />
                  Previsão Semanal
                </h4>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">IA</span>
              </div>
              <p className="text-emerald-700 text-sm leading-relaxed italic">
                {loadingAI ? "Consultando os guias..." : forecast}
              </p>
            </motion.div>
          )}

          <h3 className="text-xl font-bold text-emerald-900">Meu Status</h3>
          <div className="bg-white rounded-2xl p-6 border border-emerald-50 space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-emerald-50">
              <span className="text-emerald-600">Função</span>
              <span className="font-bold text-emerald-900">{profile?.spiritualData?.mediumType || 'Membro'}</span>
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-emerald-50">
              <span className="text-emerald-600">Entrada</span>
              <span className="font-bold text-emerald-900">{profile?.spiritualData?.entryDate ? format(new Date(profile.spiritualData.entryDate), 'dd/MM/yyyy') : '-'}</span>
            </div>
            <div className="pt-2">
              <p className="text-xs text-emerald-400 uppercase font-bold mb-2">Orixás</p>
              <div className="flex flex-wrap gap-2">
                {profile?.spiritualData?.orixaHead && <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold">{profile.spiritualData.orixaHead}</span>}
                {profile?.spiritualData?.orixaAdjunto && <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold">{profile.spiritualData.orixaAdjunto}</span>}
              </div>
            </div>
          </div>
          
          <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-100">
            <div className="flex items-center gap-3 text-emerald-700 mb-2">
              <Bell size={20} />
              <span className="font-bold">Lembretes</span>
            </div>
            <p className="text-sm text-emerald-600">Mantenha seus dados atualizados para receber avisos da casa.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgendaView({ events }: { events: TerreiroEvent[] }) {
  const [search, setSearch] = useState('');
  const filtered = events.filter(e => 
    e.title.toLowerCase().includes(search.toLowerCase()) || 
    e.description.toLowerCase().includes(search.toLowerCase()) ||
    e.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-2xl font-bold text-emerald-900">Agenda da Casa</h3>
        <div className="flex gap-2">
          <Input 
            placeholder="Buscar evento..." 
            className="w-full sm:w-64" 
            value={search}
            onChange={(e: any) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="bg-white rounded-3xl shadow-sm border border-emerald-100 overflow-hidden">
        {filtered.length > 0 ? filtered.map((event, idx) => (
          <div key={event.id} className={cn("p-6 flex flex-col sm:flex-row items-start gap-4 sm:gap-6 hover:bg-emerald-50/50 transition-all", idx !== filtered.length - 1 && "border-b border-emerald-50")}>
            <div className="text-center min-w-[60px] flex sm:flex-col items-center gap-2 sm:gap-0">
              <p className="text-xs font-bold text-emerald-400 uppercase">{format(new Date(event.date), 'MMM', { locale: ptBR })}</p>
              <p className="text-2xl sm:text-3xl font-bold text-emerald-900">{format(new Date(event.date), 'dd')}</p>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold uppercase">{event.type}</span>
                {format(new Date(event.date), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-bold uppercase flex items-center gap-1">
                    <Bell size={10} /> HOJE
                  </span>
                )}
                <span className="text-emerald-400 hidden sm:inline">•</span>
                <span className="text-emerald-600 text-sm">{format(new Date(event.date), "EEEE, HH:mm", { locale: ptBR })}</span>
              </div>
              <h4 className="text-xl font-bold text-emerald-900">{event.title}</h4>
              <p className="text-emerald-600 leading-relaxed text-sm sm:text-base">{event.description}</p>
            </div>
          </div>
        )) : (
          <div className="p-12 text-center text-emerald-400">Nenhum evento encontrado.</div>
        )}
      </div>
    </div>
  );
}

function ProfileView({ profile, onUpdate }: { profile: UserProfile | null, onUpdate: (p: UserProfile) => void }) {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<UserProfile>(profile!);
  const [aiFeedback, setAiFeedback] = useState<string>('');
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCpfUser = auth.currentUser?.email?.endsWith('@terreiro.app');

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      alert('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setIsUpdatingPassword(true);
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        alert('Senha atualizada com sucesso!');
        setShowPasswordModal(false);
        setNewPassword('');
      }
    } catch (error: any) {
      console.error('Error updating password:', error);
      if (error.code === 'auth/requires-recent-login') {
        alert('Para sua segurança, você precisa sair e entrar novamente antes de alterar a senha.');
      } else {
        alert('Erro ao atualizar senha: ' + error.message);
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleGetFeedback = async () => {
    setLoadingFeedback(true);
    try {
      const response = await callGeminiWithRetry({
        model: "gemini-3-flash-preview",
        contents: `Analise o perfil espiritual deste médium de Umbanda e dê uma sugestão de desenvolvimento ou estudo.
        Nome: ${profile?.fullName}
        Tipo de Médium: ${profile?.spiritualData?.mediumType}
        Orixá de Cabeça: ${profile?.spiritualData?.orixaHead}
        Entidades: ${profile?.spiritualData?.entities}
        
        Dê um conselho curto, motivador e respeitoso. Máximo 400 caracteres.`,
      });
      setAiFeedback(response.text);
    } catch (error: any) {
      console.error('AI Feedback Error:', error);
      setAiFeedback("Não foi possível gerar o conselho agora. Tente novamente mais tarde.");
    } finally {
      setLoadingFeedback(false);
    }
  };

  const handleSave = async () => {
    try {
      await setDoc(doc(db, 'users', profile!.uid), formData);
      onUpdate(formData);
      setEditing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${profile!.uid}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, photoUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-2xl font-bold text-emerald-900">Meu Perfil</h3>
          <div className="flex flex-col gap-3 w-full sm:w-auto">
            <Button onClick={() => editing ? handleSave() : setEditing(true)} className="flex items-center justify-center gap-2">
              <SettingsIcon size={18} />
              {editing ? 'Salvar Alterações' : 'Editar Perfil'}
            </Button>
            {isCpfUser && (
              <Button 
                variant="ghost" 
                onClick={() => setShowPasswordModal(true)}
                className="flex items-center justify-center gap-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
              >
                <ShieldCheck size={18} />
                Alterar Minha Senha
              </Button>
            )}
          </div>

        {showPasswordModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl space-y-6"
            >
              <h4 className="text-xl font-bold text-emerald-900">Alterar Senha</h4>
              <Input 
                label="Nova Senha" 
                type="password" 
                placeholder="Mínimo 6 caracteres" 
                value={newPassword}
                onChange={(e: any) => setNewPassword(e.target.value)}
              />
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setShowPasswordModal(false)} className="flex-1">Cancelar</Button>
                <Button onClick={handleUpdatePassword} disabled={isUpdatingPassword} className="flex-1">
                  {isUpdatingPassword ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'Confirmar'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-emerald-100 text-center relative group">
            <div className="w-32 h-32 mx-auto rounded-full bg-emerald-100 border-4 border-white shadow-md overflow-hidden mb-4 flex items-center justify-center relative">
              {formData.photoUrl ? (
                <img src={formData.photoUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <UserIcon size={48} className="text-emerald-200" />
              )}
              {editing && (
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Camera size={24} />
                </button>
              )}
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange} 
            />
            <h4 className="text-xl font-bold text-emerald-900">{profile?.fullName}</h4>
            <p className="text-emerald-600 text-sm">{profile?.spiritualName || 'Sem nome de santo'}</p>
          </div>

          <div className="bg-emerald-900 p-6 rounded-3xl text-white space-y-4">
            <h5 className="font-bold border-b border-emerald-800 pb-2">Dados Espirituais</h5>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="opacity-60">Orixá de Cabeça</span><span>{profile?.spiritualData?.orixaHead || '-'}</span></div>
              <div className="flex justify-between"><span className="opacity-60">Adjuntó</span><span>{profile?.spiritualData?.orixaAdjunto || '-'}</span></div>
              <div className="flex justify-between"><span className="opacity-60">Função</span><span>{profile?.spiritualData?.mediumType || '-'}</span></div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-emerald-900 flex items-center gap-2">
                <Sparkles className="text-emerald-500" size={18} />
                Orientação IA
              </h4>
              <button 
                onClick={handleGetFeedback}
                disabled={loadingFeedback}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
              >
                {loadingFeedback ? <Loader2 size={12} className="animate-spin" /> : 'Atualizar'}
              </button>
            </div>
            {aiFeedback ? (
              <p className="text-emerald-700 text-xs leading-relaxed italic">"{aiFeedback}"</p>
            ) : (
              <p className="text-emerald-400 text-[10px] italic">Clique em atualizar para receber uma orientação baseada no seu perfil.</p>
            )}
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Section title="Dados Pessoais">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Nome Completo" disabled={!editing} value={formData.fullName} onChange={(e: any) => setFormData({...formData, fullName: e.target.value})} />
              <Input label="Nome Espiritual" disabled={!editing} value={formData.spiritualName || ''} onChange={(e: any) => setFormData({...formData, spiritualName: e.target.value})} />
              <Input label="CPF" disabled={true} value={formData.cpf} />
              <Input label="RG" disabled={!editing} value={formData.rg || ''} onChange={(e: any) => setFormData({...formData, rg: e.target.value})} />
              <Input label="Data de Nascimento" type="date" disabled={!editing} value={formData.birthDate || ''} onChange={(e: any) => setFormData({...formData, birthDate: e.target.value})} />
              <Input label="Profissão" disabled={!editing} value={formData.profession || ''} onChange={(e: any) => setFormData({...formData, profession: e.target.value})} />
              <div className="sm:col-span-2">
                <Input label="Filiação (Pai e Mãe)" disabled={!editing} value={formData.parents || ''} onChange={(e: any) => setFormData({...formData, parents: e.target.value})} />
              </div>
            </div>
          </Section>

          <Section title="Contato & Endereço">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="WhatsApp" disabled={!editing} value={formData.contacts?.whatsapp || ''} onChange={(e: any) => setFormData({...formData, contacts: {...formData.contacts!, whatsapp: e.target.value}})} />
              <Input label="Telefone" disabled={!editing} value={formData.contacts?.phone || ''} onChange={(e: any) => setFormData({...formData, contacts: {...formData.contacts!, phone: e.target.value}})} />
              <div className="sm:col-span-2">
                <Input label="Rua" disabled={!editing} value={formData.address?.street || ''} onChange={(e: any) => setFormData({...formData, address: {...formData.address!, street: e.target.value}})} />
              </div>
              <Input label="Número" disabled={!editing} value={formData.address?.number || ''} onChange={(e: any) => setFormData({...formData, address: {...formData.address!, number: e.target.value}})} />
              <Input label="Bairro" disabled={!editing} value={formData.address?.neighborhood || ''} onChange={(e: any) => setFormData({...formData, address: {...formData.address!, neighborhood: e.target.value}})} />
              <Input label="Cidade" disabled={!editing} value={formData.address?.city || ''} onChange={(e: any) => setFormData({...formData, address: {...formData.address!, city: e.target.value}})} />
              <Input label="Estado" disabled={!editing} value={formData.address?.state || ''} onChange={(e: any) => setFormData({...formData, address: {...formData.address!, state: e.target.value}})} />
              <Input label="CEP" disabled={!editing} value={formData.address?.zipCode || ''} onChange={(e: any) => setFormData({...formData, address: {...formData.address!, zipCode: e.target.value}})} />
            </div>
          </Section>

          <Section title="Histórico Espiritual">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Orixá de Cabeça" disabled={!editing} value={formData.spiritualData?.orixaHead || ''} onChange={(e: any) => setFormData({...formData, spiritualData: {...formData.spiritualData!, orixaHead: e.target.value}})} />
              <Input label="Orixá Adjuntó" disabled={!editing} value={formData.spiritualData?.orixaAdjunto || ''} onChange={(e: any) => setFormData({...formData, spiritualData: {...formData.spiritualData!, orixaAdjunto: e.target.value}})} />
              <Input label="Chefe de Coroa" disabled={!editing} value={formData.spiritualData?.chefeCoroa || ''} onChange={(e: any) => setFormData({...formData, spiritualData: {...formData.spiritualData!, chefeCoroa: e.target.value}})} />
              <Input label="Tipo de Médium" disabled={!editing} value={formData.spiritualData?.mediumType || ''} onChange={(e: any) => setFormData({...formData, spiritualData: {...formData.spiritualData!, mediumType: e.target.value}})} />
              <Input label="Tempo na Umbanda" disabled={!editing} value={formData.spiritualData?.timeInUmbanda || ''} onChange={(e: any) => setFormData({...formData, spiritualData: {...formData.spiritualData!, timeInUmbanda: e.target.value}})} />
              <Input label="Religião Anterior" disabled={!editing} value={formData.spiritualData?.previousReligion || ''} onChange={(e: any) => setFormData({...formData, spiritualData: {...formData.spiritualData!, previousReligion: e.target.value}})} />
              <Input label="Pai/Mãe de Santo Anterior" disabled={!editing} value={formData.spiritualData?.previousPaiMae || ''} onChange={(e: any) => setFormData({...formData, spiritualData: {...formData.spiritualData!, previousPaiMae: e.target.value}})} />
              <Input label="Data de Entrada na Casa" type="date" disabled={!editing} value={formData.spiritualData?.entryDate || ''} onChange={(e: any) => setFormData({...formData, spiritualData: {...formData.spiritualData!, entryDate: e.target.value}})} />
              <div className="sm:col-span-2">
                <Input label="Outros Orixás" disabled={!editing} value={formData.spiritualData?.orixas || ''} onChange={(e: any) => setFormData({...formData, spiritualData: {...formData.spiritualData!, orixas: e.target.value}})} />
              </div>
              <div className="sm:col-span-2">
                <Input label="Entidades (separadas por vírgula)" disabled={!editing} value={formData.spiritualData?.entities || ''} onChange={(e: any) => setFormData({...formData, spiritualData: {...formData.spiritualData!, entities: e.target.value}})} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-emerald-900">Histórico de Obrigações</label>
                <textarea 
                  disabled={!editing}
                  className="w-full px-4 py-2 rounded-lg border border-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 h-24 disabled:bg-gray-50"
                  value={formData.spiritualData?.obligationsHistory || ''}
                  onChange={(e: any) => setFormData({...formData, spiritualData: {...formData.spiritualData!, obligationsHistory: e.target.value}})}
                />
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: any) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-emerald-100 space-y-4">
      <h5 className="text-lg font-bold text-emerald-900 border-b border-emerald-50 pb-2">{title}</h5>
      {children}
    </div>
  );
}

// --- Admin Views ---

function AdminMembersView({ onResetAccess }: { onResetAccess: (m: UserProfile) => void }) {
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [editingMember, setEditingMember] = useState<UserProfile | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMemberData, setNewMemberData] = useState({
    fullName: '',
    cpf: '',
    password: '',
    role: 'member' as UserRole
  });
  const [isCreating, setIsCreating] = useState(false);
  const [aiInsight, setAiInsight] = useState<{ uid: string, text: string } | null>(null);
  const [loadingInsight, setLoadingInsight] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      setMembers(snapshot.docs.map(doc => doc.data() as UserProfile));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return unsub;
  }, []);

  const handleCreateMember = async () => {
    if (!newMemberData.fullName || !newMemberData.cpf) {
      alert('Por favor, preencha Nome e CPF.');
      return;
    }
    setIsCreating(true);

    const cleanCpf = newMemberData.cpf.replace(/\D/g, '');
    const email = `${cleanCpf}@terreiro.app`;

    try {
      let uid = `pending_${Date.now()}`;
      let authLinked = false;

      // If admin provided a password, create Auth user now
      if (newMemberData.password) {
        const secondaryApp = initializeApp(firebaseConfig, 'Secondary');
        const secondaryAuth = getAuth(secondaryApp);
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, newMemberData.password);
        uid = userCredential.user.uid;
        authLinked = true;
        await deleteApp(secondaryApp);
      }

      const newProfile: UserProfile = {
        uid,
        cpf: newMemberData.cpf,
        role: newMemberData.role,
        fullName: newMemberData.fullName,
        authLinked,
        contacts: {
          email: '',
          phone: '',
          whatsapp: ''
        }
      };

      await setDoc(doc(db, 'users', uid), newProfile);
      
      setShowCreateModal(false);
      setNewMemberData({ fullName: '', cpf: '', password: '', role: 'member' });
      alert(authLinked ? 'Membro criado com acesso ativo!' : 'Membro cadastrado! Ele poderá criar a senha no Primeiro Acesso.');
    } catch (error: any) {
      console.error('Error creating member:', error);
      if (error.code === 'auth/operation-not-allowed') {
        alert('Erro: O login por E-mail/Senha não está habilitado no Firebase Console. Por favor, habilite-o em Authentication > Sign-in method para permitir o cadastro de novos membros.');
      } else {
        alert('Erro ao criar membro: ' + error.message);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleGenerateInsight = async (member: UserProfile) => {
    setLoadingInsight(member.uid);
    try {
      const response = await callGeminiWithRetry({
        model: "gemini-3-flash-preview",
        contents: `Analise o perfil espiritual deste membro de um terreiro de Umbanda e forneça um breve insight (máximo 3 frases) sobre seu desenvolvimento ou pontos de atenção para os dirigentes.
        
        Dados do Membro:
        - Nome: ${member.fullName}
        - Nome Espiritual: ${member.spiritualName || 'Não informado'}
        - Orixá de Cabeça: ${member.spiritualData?.orixaHead || 'Não informado'}
        - Tipo de Médium: ${member.spiritualData?.mediumType || 'Não informado'}
        - Tempo na Umbanda: ${member.spiritualData?.timeInUmbanda || 'Não informado'}
        - Histórico de Obrigações: ${member.spiritualData?.obligationsHistory || 'Não informado'}`,
      });
      setAiInsight({ uid: member.uid, text: response.text });
    } catch (error: any) {
      console.error('AI Error:', error);
      alert(error.message || 'Erro ao gerar insight.');
    } finally {
      setLoadingInsight(null);
    }
  };

  const handleSaveMember = async () => {
    if (!editingMember) return;
    try {
      await setDoc(doc(db, 'users', editingMember.uid), editingMember);
      setEditingMember(null);
      alert('Membro atualizado com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${editingMember.uid}`);
    }
  };

  const handleDeleteMember = async (member: UserProfile) => {
    if (!window.confirm(`Tem certeza que deseja excluir o membro ${member.fullName}? Esta ação não removerá o acesso dele do sistema, apenas o perfil.`)) return;
    try {
      await deleteDoc(doc(db, 'users', member.uid));
      alert('Perfil excluído com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${member.uid}`);
    }
  };

  const filtered = members.filter(m => m.fullName.toLowerCase().includes(search.toLowerCase()) || m.cpf.includes(search));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-2xl font-bold text-emerald-900">Gestão de Membros</h3>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" size={18} />
            <input 
              placeholder="Buscar por nome ou CPF..." 
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2">
            <Plus size={18} />
            Novo Membro
          </Button>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6"
          >
            <div className="flex items-center justify-between border-b border-emerald-50 pb-4">
              <h4 className="text-xl font-bold text-emerald-900">Cadastrar Novo Membro</h4>
              <button onClick={() => setShowCreateModal(false)} className="text-emerald-400 hover:text-emerald-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>

            <div className="space-y-4">
              <Input 
                label="Nome Completo" 
                placeholder="Ex: João Silva" 
                value={newMemberData.fullName}
                onChange={(e: any) => setNewMemberData({...newMemberData, fullName: e.target.value})}
              />
              <Input 
                label="CPF" 
                placeholder="000.000.000-00" 
                value={newMemberData.cpf}
                onChange={(e: any) => setNewMemberData({...newMemberData, cpf: e.target.value})}
              />
              <Input 
                label="Senha de Acesso" 
                type="password"
                placeholder="Mínimo 6 caracteres" 
                value={newMemberData.password}
                onChange={(e: any) => setNewMemberData({...newMemberData, password: e.target.value})}
              />
              <div className="space-y-1">
                <label className="text-sm font-medium text-emerald-900">Papel no Sistema</label>
                <select 
                  className="w-full px-4 py-2 rounded-lg border border-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={newMemberData.role}
                  onChange={(e: any) => setNewMemberData({...newMemberData, role: e.target.value as UserRole})}
                >
                  <option value="member">Membro</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="ghost" onClick={() => setShowCreateModal(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleCreateMember} disabled={isCreating} className="flex-1">
                {isCreating ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'Cadastrar'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {editingMember && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-6 md:p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-8"
          >
            <div className="flex items-center justify-between border-b border-emerald-50 pb-4">
              <h4 className="text-xl md:text-2xl font-bold text-emerald-900">Editar Membro</h4>
              <button onClick={() => setEditingMember(null)} className="text-emerald-400 hover:text-emerald-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Section title="Dados Pessoais">
                <div className="grid gap-4">
                  <Input label="Nome Completo" value={editingMember.fullName} onChange={(e: any) => setEditingMember({...editingMember, fullName: e.target.value})} />
                  <Input label="Nome Espiritual" value={editingMember.spiritualName || ''} onChange={(e: any) => setEditingMember({...editingMember, spiritualName: e.target.value})} />
                  <Input label="CPF" disabled value={editingMember.cpf} />
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-emerald-900">Papel no Sistema</label>
                    <select 
                      className="w-full px-4 py-2 rounded-lg border border-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={editingMember.role}
                      onChange={(e: any) => setEditingMember({...editingMember, role: e.target.value as UserRole})}
                    >
                      <option value="member">Membro</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                </div>
              </Section>

              <Section title="Dados Espirituais">
                <div className="grid gap-4">
                  <Input label="Orixá de Cabeça" value={editingMember.spiritualData?.orixaHead || ''} onChange={(e: any) => setEditingMember({...editingMember, spiritualData: {...editingMember.spiritualData!, orixaHead: e.target.value}})} />
                  <Input label="Orixá Adjuntó" value={editingMember.spiritualData?.orixaAdjunto || ''} onChange={(e: any) => setEditingMember({...editingMember, spiritualData: {...editingMember.spiritualData!, orixaAdjunto: e.target.value}})} />
                  <Input label="Tipo de Médium" value={editingMember.spiritualData?.mediumType || ''} onChange={(e: any) => setEditingMember({...editingMember, spiritualData: {...editingMember.spiritualData!, mediumType: e.target.value}})} />
                </div>
              </Section>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-emerald-50">
              <Button variant="ghost" onClick={() => setEditingMember(null)} className="w-full sm:w-auto">Cancelar</Button>
              <Button onClick={handleSaveMember} className="w-full sm:w-auto">Salvar Alterações</Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-3xl border border-emerald-100 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
            <tr>
              <th className="px-6 py-4">Membro</th>
              <th className="px-6 py-4">CPF</th>
              <th className="px-6 py-4">Papel</th>
              <th className="px-6 py-4">Função</th>
              <th className="px-6 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-50">
            {filtered.map(member => (
              <tr key={member.uid} className="hover:bg-emerald-50/30 transition-all">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold overflow-hidden">
                      {member.photoUrl ? (
                        <img src={member.photoUrl} alt={member.fullName} className="w-full h-full object-cover" />
                      ) : (
                        member.fullName[0]
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-emerald-900">{member.fullName}</p>
                      <p className="text-xs text-emerald-500">{member.spiritualName || 'Sem nome de santo'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-emerald-600 font-mono text-sm">{member.cpf}</td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                    member.role === 'admin' ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"
                  )}>
                    {member.role}
                  </span>
                </td>
                <td className="px-6 py-4 text-emerald-600 text-sm">{member.spiritualData?.mediumType || '-'}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button 
                      onClick={() => handleGenerateInsight(member)}
                      disabled={loadingInsight === member.uid}
                      className="text-emerald-500 hover:text-emerald-700 disabled:opacity-50"
                      title="Gerar Insight IA"
                    >
                      {loadingInsight === member.uid ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    </button>
                    <button 
                      onClick={() => onResetAccess(member)}
                      className="text-amber-500 hover:text-amber-700"
                      title="Resetar Acesso (Nova Senha)"
                    >
                      <ShieldCheck size={16} />
                    </button>
                    <button 
                      onClick={() => setEditingMember(member)}
                      className="text-emerald-600 hover:text-emerald-800 font-bold text-sm"
                    >
                      Editar
                    </button>
                    <button 
                      onClick={() => handleDeleteMember(member)}
                      className="text-red-500 hover:text-red-700"
                      title="Excluir Perfil"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {filtered.map(member => (
          <div key={member.uid} className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold overflow-hidden">
                  {member.photoUrl ? (
                    <img src={member.photoUrl} alt={member.fullName} className="w-full h-full object-cover" />
                  ) : (
                    member.fullName[0]
                  )}
                </div>
                <div>
                  <p className="font-bold text-emerald-900">{member.fullName}</p>
                  <p className="text-xs text-emerald-500">{member.spiritualName || 'Sem nome de santo'}</p>
                </div>
              </div>
              <span className={cn(
                "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                member.role === 'admin' ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"
              )}>
                {member.role}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-emerald-50 text-sm">
              <div>
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">CPF</p>
                <p className="text-emerald-900 font-mono">{member.cpf}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Mediunidade</p>
                <p className="text-emerald-900">{member.spiritualData?.mediumType || '-'}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-4 pt-4">
              <button 
                onClick={() => handleGenerateInsight(member)}
                disabled={loadingInsight === member.uid}
                className="flex items-center gap-2 text-emerald-600 font-bold text-sm disabled:opacity-50"
              >
                {loadingInsight === member.uid ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                Insight IA
              </button>
              <button 
                onClick={() => setEditingMember(member)}
                className="text-emerald-900 font-bold text-sm"
              >
                Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      {aiInsight && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-8 right-8 max-w-sm bg-white p-6 rounded-3xl shadow-2xl border border-emerald-100 z-50"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <Sparkles size={20} />
              <h4 className="font-bold">Insight Espiritual (IA)</h4>
            </div>
            <button onClick={() => setAiInsight(null)} className="text-emerald-300 hover:text-emerald-500">
              <Plus size={20} className="rotate-45" />
            </button>
          </div>
          <p className="text-sm text-emerald-900 leading-relaxed italic">
            "{aiInsight.text}"
          </p>
          <p className="mt-4 text-[10px] text-emerald-400 uppercase font-bold tracking-widest">
            Para o membro: {members.find(m => m.uid === aiInsight.uid)?.fullName}
          </p>
        </motion.div>
      )}
    </div>
  );
}

function AdminEventsView({ events }: { events: TerreiroEvent[] }) {
  const [showForm, setShowForm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState<string | null>(null);
  const [scriptModal, setScriptModal] = useState<{ title: string, content: string } | null>(null);
  const [formData, setFormData] = useState<Partial<TerreiroEvent>>({
    title: '',
    description: '',
    date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    type: 'gira',
    imageUrl: ''
  });

  const handleGenerateAI = async () => {
    if (!formData.title) {
      alert('Por favor, digite um título para o evento primeiro.');
      return;
    }
    setIsGenerating(true);
    try {
      const response = await callGeminiWithRetry({
        model: "gemini-3-flash-preview",
        contents: `Escreva uma descrição curta e convidativa para um evento de terreiro de Umbanda chamado "${formData.title}". O tipo do evento é "${formData.type}". Seja respeitoso e use termos adequados da religião.`,
      });
      setFormData({ ...formData, description: response.text });
    } catch (error: any) {
      console.error('AI Error:', error);
      alert(error.message || 'Erro ao gerar descrição com IA.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!formData.title) {
      alert('Por favor, digite um título para o evento primeiro.');
      return;
    }
    setIsGeneratingImage(true);
    try {
      const response = await callGeminiWithRetry({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: `Uma imagem artística e espiritual representando um evento de Umbanda chamado "${formData.title}". O tema é "${formData.type}". Use cores suaves, elementos da natureza e símbolos sagrados da Umbanda de forma respeitosa. Estilo pintura a óleo ou arte digital suave.`,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9",
          },
        },
      });
      
      for (const part of response.candidates![0].content.parts) {
        if (part.inlineData) {
          const imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          setFormData({ ...formData, imageUrl });
        }
      }
    } catch (error: any) {
      console.error('AI Image Error:', error);
      alert(error.message || 'Erro ao gerar imagem com IA.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateScript = async (event: TerreiroEvent) => {
    setIsGeneratingScript(event.id);
    try {
      const response = await callGeminiWithRetry({
        model: "gemini-3-flash-preview",
        contents: `Gere um roteiro sugerido para um evento de Umbanda.
        Título: ${event.title}
        Tipo: ${event.type}
        Descrição: ${event.description}
        
        O roteiro deve incluir:
        1. Sequência de abertura (defumação, hinos, etc).
        2. Sugestão de 3 pontos cantados específicos para o tema.
        3. Orientações para os médiuns.
        4. Sequência de fechamento.`,
      });
      setScriptModal({ title: event.title, content: response.text });
    } catch (error: any) {
      console.error('AI Script Error:', error);
      alert(error.message || 'Erro ao gerar roteiro com IA.');
    } finally {
      setIsGeneratingScript(null);
    }
  };

  const handleCreate = async () => {
    try {
      const newId = doc(collection(db, 'events')).id;
      await setDoc(doc(db, 'events', newId), {
        ...formData,
        id: newId,
        createdBy: auth.currentUser?.uid
      });
      setShowForm(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'events');
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este evento?')) return;
    try {
      await deleteDoc(doc(db, 'events', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-2xl font-bold text-emerald-900">Gerenciar Agenda</h3>
        <Button onClick={() => setShowForm(true)} className="flex items-center justify-center gap-2 w-full sm:w-auto">
          <Plus size={18} /> Novo Evento
        </Button>
      </div>

      {showForm && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-emerald-100 shadow-xl space-y-6">
          <h4 className="text-xl font-bold text-emerald-900">Novo Evento</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input label="Título" value={formData.title} onChange={(e: any) => setFormData({...formData, title: e.target.value})} />
            <div className="space-y-1">
              <label className="text-sm font-medium text-emerald-900">Tipo</label>
              <select 
                className="w-full px-4 py-2 rounded-lg border border-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={formData.type}
                onChange={(e: any) => setFormData({...formData, type: e.target.value})}
              >
                <option value="gira">Gira</option>
                <option value="festa">Festa</option>
                <option value="obrigacao">Obrigação</option>
                <option value="reuniao">Reunião</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <Input label="Data e Hora" type="datetime-local" value={formData.date} onChange={(e: any) => setFormData({...formData, date: e.target.value})} />
            <div className="md:col-span-2 space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-emerald-900">Descrição</label>
                  <button 
                    onClick={handleGenerateAI}
                    disabled={isGenerating}
                    className="text-xs flex items-center gap-1 text-emerald-600 hover:text-emerald-800 font-bold disabled:opacity-50"
                  >
                    {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    Gerar com IA
                  </button>
                </div>
                <textarea 
                  className="w-full px-4 py-2 rounded-lg border border-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 h-24"
                  value={formData.description}
                  onChange={(e: any) => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-emerald-900">Imagem do Evento (Opcional)</label>
                  <button 
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage}
                    className="text-xs flex items-center gap-1 text-emerald-600 hover:text-emerald-800 font-bold disabled:opacity-50"
                  >
                    {isGeneratingImage ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    Gerar Imagem com IA
                  </button>
                </div>
                {formData.imageUrl ? (
                  <div className="relative group">
                    <img src={formData.imageUrl} alt="Preview" className="w-full h-48 object-cover rounded-xl border border-emerald-100" />
                    <button 
                      onClick={() => setFormData({...formData, imageUrl: ''})}
                      className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Plus size={16} className="rotate-45" />
                    </button>
                  </div>
                ) : (
                  <div className="w-full h-48 border-2 border-dashed border-emerald-100 rounded-xl flex items-center justify-center text-emerald-300">
                    Nenhuma imagem selecionada
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowForm(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={handleCreate} className="w-full sm:w-auto">Criar Evento</Button>
          </div>
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-3xl border border-emerald-100 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
            <tr>
              <th className="px-6 py-4">Data</th>
              <th className="px-6 py-4">Evento</th>
              <th className="px-6 py-4">Tipo</th>
              <th className="px-6 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-50">
            {events.map(event => (
              <tr key={event.id} className="hover:bg-emerald-50/30 transition-all">
                <td className="px-6 py-4 text-emerald-900 font-medium">{format(new Date(event.date), 'dd/MM/yyyy HH:mm')}</td>
                <td className="px-6 py-4 font-bold text-emerald-900">{event.title}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold uppercase">{event.type}</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button 
                      onClick={() => handleGenerateScript(event)}
                      disabled={isGeneratingScript === event.id}
                      className="text-emerald-600 hover:text-emerald-800 font-bold text-sm flex items-center gap-1 disabled:opacity-50"
                      title="Sugerir Roteiro IA"
                    >
                      {isGeneratingScript === event.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      Roteiro
                    </button>
                    <button 
                      onClick={() => handleDeleteEvent(event.id)}
                      className="text-red-400 hover:text-red-600 transition-colors"
                      title="Excluir Evento"
                    >
                      <Plus size={18} className="rotate-45" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {events.map(event => (
          <div key={event.id} className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold uppercase">{event.type}</span>
              <p className="text-xs text-emerald-500 font-medium">{format(new Date(event.date), 'dd/MM/yyyy HH:mm')}</p>
            </div>
            <h4 className="text-lg font-bold text-emerald-900">{event.title}</h4>
            <div className="flex items-center justify-end gap-4 pt-4 border-t border-emerald-50">
              <button 
                onClick={() => handleGenerateScript(event)}
                disabled={isGeneratingScript === event.id}
                className="text-emerald-600 hover:text-emerald-800 font-bold text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isGeneratingScript === event.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={16} />}
                Roteiro IA
              </button>
              <button 
                onClick={() => handleDeleteEvent(event.id)}
                className="text-red-500 font-bold text-sm"
              >
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      {scriptModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3 text-emerald-600">
                <Sparkles size={24} />
                <h4 className="text-xl font-bold">Roteiro Sugerido: {scriptModal.title}</h4>
              </div>
              <button onClick={() => setScriptModal(null)} className="text-emerald-400 hover:text-emerald-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <div className="prose prose-emerald max-w-none">
              <Markdown>{scriptModal.content}</Markdown>
            </div>
            <div className="mt-8 pt-6 border-t border-emerald-50 flex justify-end">
              <Button onClick={() => setScriptModal(null)}>Fechar</Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function AIAssistantView({ profile, settings }: { profile: UserProfile | null, settings: TerreiroSettings | null }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([
    { role: 'ai', content: `Olá, ${profile?.fullName.split(' ')[0]}! Sou o Assistente Espiritual da casa ${settings?.terreiroName}. Como posso te ajudar hoje?` }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const stream = await callGeminiStreamWithRetry({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: `Você é um Assistente Espiritual de um terreiro de Umbanda chamado "${settings?.terreiroName}". 
          Sua missão é ajudar os membros com dúvidas sobre a religião, a casa e seu próprio desenvolvimento.
          
          Contexto do Membro Atual:
          - Nome: ${profile?.fullName}
          - Nome Espiritual: ${profile?.spiritualName || 'Não informado'}
          - Orixá de Cabeça: ${profile?.spiritualData?.orixaHead || 'Não informado'}
          - Orixá Adjuntó: ${profile?.spiritualData?.orixaAdjunto || 'Não informado'}
          - Tipo de Médium: ${profile?.spiritualData?.mediumType || 'Não informado'}
          - Entidades: ${profile?.spiritualData?.entities || 'Não informado'}
          
          Mensagem de boas-vindas da casa: "${settings?.welcomeMessage}"
          
          Instruções:
          1. Seja sempre respeitoso, acolhedor e use uma linguagem que remeta à Umbanda (ex: Axé, Saravá).
          2. Se o membro perguntar sobre seus Orixás ou entidades, use as informações do perfil dele.
          3. Não dê conselhos médicos ou jurídicos.
          4. Se não souber algo específico da doutrina da casa que não foi informado, sugira que ele fale com os dirigentes.
          5. Responda em Português do Brasil.`
        },
        contents: messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        })).concat([{ role: 'user', parts: [{ text: userMsg }] }])
      });

      let fullText = '';
      setMessages(prev => [...prev, { role: 'ai', content: '' }]);
      
      for await (const chunk of stream) {
        fullText += chunk.text;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          const rest = prev.slice(0, -1);
          return [...rest, { role: 'ai', content: fullText }];
        });
      }
    } catch (error) {
      console.error('AI Error:', error);
      setMessages(prev => [...prev, { role: 'ai', content: 'Ocorreu um erro ao me conectar com o plano espiritual (erro técnico). Tente novamente mais tarde.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-12rem)] flex flex-col bg-white rounded-3xl border border-emerald-100 shadow-sm overflow-hidden">
      <div className="p-4 md:p-6 bg-emerald-900 text-white flex items-center gap-3">
        <div className="p-2 bg-emerald-800 rounded-xl">
          <Sparkles size={24} />
        </div>
        <div>
          <h3 className="font-bold text-base md:text-lg">Assistente Espiritual</h3>
          <p className="text-[10px] md:text-xs text-emerald-300">Inteligência Artificial a serviço do Axé</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-emerald-50/30">
        {messages.map((m, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={i} 
            className={cn(
              "max-w-[90%] md:max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed",
              m.role === 'user' 
                ? "ml-auto bg-emerald-600 text-white rounded-tr-none" 
                : "mr-auto bg-white text-emerald-900 border border-emerald-100 rounded-tl-none shadow-sm"
            )}
          >
            <Markdown>{m.content}</Markdown>
          </motion.div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium italic">
            <Loader2 size={14} className="animate-spin" />
            O assistente está refletindo...
          </div>
        )}
      </div>

      <div className="p-4 border-t border-emerald-100 bg-white">
        <div className="flex gap-2">
          <input 
            placeholder="Pergunte algo..." 
            className="flex-1 px-4 py-3 rounded-xl border border-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button 
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="p-3 bg-emerald-900 text-white rounded-xl hover:bg-emerald-800 transition-all disabled:opacity-50"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
function AdminSettingsView({ settings, onUpdate }: { settings: TerreiroSettings | null, onUpdate: (s: TerreiroSettings) => void }) {
  const [formData, setFormData] = useState<TerreiroSettings>(settings!);
  const [importUrl, setImportUrl] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const handleSave = async () => {
    try {
      await setDoc(doc(db, 'settings', 'global'), formData);
      onUpdate(formData);
      alert('Configurações salvas!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
    }
  };

  const handleUpdateAdminPassword = async () => {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(newAdminPassword)) {
      alert('A senha deve ter no mínimo 8 caracteres, incluindo letras maiúsculas, minúsculas e números.');
      return;
    }
    setIsUpdatingPassword(true);
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newAdminPassword);
        alert('Senha do administrador atualizada com sucesso!');
        setNewAdminPassword('');
      }
    } catch (error: any) {
      console.error('Update password error:', error);
      if (error.code === 'auth/requires-recent-login') {
        alert('Para sua segurança, você precisa sair e entrar novamente no sistema antes de alterar a senha do administrador.');
      } else {
        alert('Erro ao atualizar senha: ' + error.message);
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleImport = async () => {
    if (!importUrl) return;
    try {
      const response = await fetch(importUrl);
      const data = await response.json();
      if (Array.isArray(data)) {
        for (const member of data) {
          if (member.uid && member.cpf) {
            await setDoc(doc(db, 'users', member.uid), member);
          }
        }
        alert(`${data.length} membros importados com sucesso!`);
      }
    } catch (error) {
      alert('Erro ao importar dados. Verifique a URL e o formato do JSON.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h3 className="text-2xl font-bold text-emerald-900">Configurações do Terreiro</h3>
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-emerald-100 shadow-sm space-y-6">
        <Input label="Nome do Terreiro" value={formData.terreiroName} onChange={(e: any) => setFormData({...formData, terreiroName: e.target.value})} />
        <Input label="URL da Logo" value={formData.logoUrl} onChange={(e: any) => setFormData({...formData, logoUrl: e.target.value})} />
        <div className="space-y-1">
          <label className="text-sm font-medium text-emerald-900">Mensagem de Boas-vindas</label>
          <textarea 
            className="w-full px-4 py-2 rounded-lg border border-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 h-32"
            value={formData.welcomeMessage}
            onChange={(e: any) => setFormData({...formData, welcomeMessage: e.target.value})}
          />
        </div>
        <div className="pt-4 border-t border-emerald-50">
          <h5 className="font-bold text-emerald-900 mb-4">Importar Banco de Dados (Opcional)</h5>
          <p className="text-sm text-emerald-600 mb-4">Adicione uma URL de API ou JSON para facilitar o cadastro de membros existentes.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input 
              placeholder="https://api.exemplo.com/membros" 
              className="flex-1"
              value={importUrl}
              onChange={(e: any) => setImportUrl(e.target.value)}
            />
            <Button variant="secondary" onClick={handleImport} className="w-full sm:w-auto">Importar</Button>
          </div>
        </div>
        <div className="pt-8 border-t border-emerald-50 space-y-4">
          <h5 className="font-bold text-emerald-900">Segurança da Conta</h5>
          <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 space-y-4">
            <div className="flex items-center gap-3 text-emerald-700">
              <ShieldCheck size={20} />
              <span className="font-bold">Alterar Senha do Administrador</span>
            </div>
            <p className="text-sm text-emerald-600">Digite abaixo a nova senha que deseja utilizar para o perfil administrador.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input 
                type="password" 
                placeholder="Nova senha (mín. 6 caracteres)" 
                className="flex-1"
                value={newAdminPassword}
                onChange={(e: any) => setNewAdminPassword(e.target.value)}
              />
              <Button 
                onClick={handleUpdateAdminPassword}
                disabled={isUpdatingPassword || newAdminPassword.length < 6}
                className="whitespace-nowrap"
              >
                {isUpdatingPassword ? <Loader2 className="animate-spin" size={20} /> : 'Atualizar Senha'}
              </Button>
            </div>
          </div>
        </div>
        <Button onClick={handleSave} className="w-full">Salvar Configurações</Button>
      </div>
    </div>
  );
}

function HerbGuideView({ profile }: { profile: UserProfile | null }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ herbs: string[], instructions: string, purpose: string } | null>(null);

  const handleConsult = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    try {
      const response = await callGeminiWithRetry({
        model: "gemini-3-flash-preview",
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              herbs: { type: Type.ARRAY, items: { type: Type.STRING } },
              instructions: { type: Type.STRING },
              purpose: { type: Type.STRING }
            },
            required: ["herbs", "instructions", "purpose"]
          }
        },
        contents: `Sugira um banho de ervas ou defumação de Umbanda para a seguinte situation: "${query}". 
        Considere que o membro tem como Orixá de cabeça ${profile?.spiritualData?.orixaHead || 'não informado'}.
        Retorne uma lista de ervas, instruções de preparo e o propósito espiritual.`,
      });
      setResult(JSON.parse(response.text));
    } catch (error: any) {
      console.error('AI Error:', error);
      alert(error.message || 'Erro ao consultar o guia de ervas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-emerald-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
              <Leaf size={32} className="text-emerald-300" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-serif font-bold">Guia de Ervas & Banhos IA</h3>
              <p className="text-emerald-100 opacity-80 text-sm md:text-base">Conhecimento ancestral potencializado pela tecnologia.</p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <input 
              type="text" 
              placeholder="Como você está se sentindo? (Ex: Limpeza, Proteção...)"
              className="flex-1 px-6 py-3 rounded-2xl bg-white/10 border border-white/20 text-white placeholder:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 backdrop-blur-md"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConsult()}
            />
            <button 
              onClick={handleConsult}
              disabled={loading}
              className="px-6 py-3 bg-white text-emerald-900 rounded-2xl font-bold hover:bg-emerald-50 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
              Consultar
            </button>
          </div>
        </div>
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-emerald-800 rounded-full -mr-20 -mb-20 opacity-20 blur-3xl"></div>
      </div>

      <AnimatePresence>
        {result && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <div className="md:col-span-1 bg-white p-6 md:p-8 rounded-3xl border border-emerald-100 shadow-sm space-y-6">
              <h4 className="font-bold text-emerald-900 flex items-center gap-2">
                <Leaf className="text-emerald-500" size={20} />
                Ervas Sugeridas
              </h4>
              <ul className="space-y-3">
                {result.herbs.map((herb, i) => (
                  <li key={i} className="flex items-center gap-3 text-emerald-700">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                    {herb}
                  </li>
                ))}
              </ul>
              <div className="pt-6 border-t border-emerald-50">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">Propósito</p>
                <p className="text-emerald-800 font-medium leading-relaxed">{result.purpose}</p>
              </div>
            </div>

            <div className="md:col-span-2 bg-white p-6 md:p-8 rounded-3xl border border-emerald-100 shadow-sm space-y-6">
              <h4 className="font-bold text-emerald-900 flex items-center gap-2">
                <Sparkles className="text-emerald-500" size={20} />
                Instruções de Preparo
              </h4>
              <div className="prose prose-emerald max-w-none text-emerald-700 leading-relaxed">
                <Markdown>{result.instructions}</Markdown>
              </div>
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                <p className="text-xs text-amber-800 leading-relaxed">
                  <strong>Lembre-se:</strong> O preparo de banhos deve ser feito com fé e concentração. Respeite as orientações da sua casa e de seus guias.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!result && !loading && (
        <div className="py-20 text-center space-y-4">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-200">
            <Leaf size={40} />
          </div>
          <p className="text-emerald-400 font-medium px-6">Descreva sua necessidade acima para receber orientações sobre ervas e banhos.</p>
        </div>
      )}
    </div>
  );
}

function PontoLibraryView() {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [pontos, setPontos] = useState<{ title: string, lyrics: string, type: string, foundation: string }[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleSearch = async () => {
    if (!search.trim() || loading) return;
    setLoading(true);
    try {
      const response = await callGeminiWithRetry({
        model: "gemini-3-flash-preview",
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                lyrics: { type: Type.STRING },
                type: { type: Type.STRING },
                foundation: { type: Type.STRING, description: "O fundamento espiritual e significado deste ponto." }
              },
              required: ["title", "lyrics", "type", "foundation"]
            }
          }
        },
        contents: `Encontre ou sugira 3 pontos cantados de Umbanda relacionados a: "${search}". 
        Retorne o título, a letra completa, o tipo (ex: Caboclo, Preto Velho, Exu, etc) e o fundamento espiritual do ponto.`,
      });
      
      const data = JSON.parse(response.text);
      setPontos(data);
    } catch (error: any) {
      console.error('AI Error:', error);
      alert(error.message || 'Erro ao buscar pontos com IA.');
    } finally {
      setLoading(false);
    }
  };

  const playPonto = async (ponto: any) => {
    if (playing === ponto.title) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }

    setPlaying(ponto.title);
    try {
      const response = await callGeminiWithRetry({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Cante ou recite este ponto de Umbanda com devoção: ${ponto.lyrics}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioBlob = await fetch(`data:audio/wav;base64,${base64Audio}`).then(res => res.blob());
        const audioUrl = URL.createObjectURL(audioBlob);
        
        if (audioRef.current) {
          audioRef.current.pause();
        }
        
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => setPlaying(null);
        audio.play();
      }
    } catch (error: any) {
      console.error('TTS Error:', error);
      alert(error.message || 'Erro ao gerar áudio do ponto.');
      setPlaying(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-emerald-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
              <Music size={32} className="text-emerald-300" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-serif font-bold">Biblioteca de Pontos IA</h3>
              <p className="text-emerald-100 opacity-80 text-sm md:text-base">Letras, fundamentos e áudio sugerido por IA.</p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <input 
              type="text" 
              placeholder="Ex: Pontos de Caboclo, Pontos de Iemanjá..."
              className="flex-1 px-6 py-3 rounded-2xl bg-white/10 border border-white/20 text-white placeholder:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 backdrop-blur-md"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button 
              onClick={handleSearch}
              disabled={loading}
              className="px-6 py-3 bg-white text-emerald-900 rounded-2xl font-bold hover:bg-emerald-50 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
              Buscar
            </button>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-800 rounded-full -mr-20 -mt-20 opacity-20 blur-3xl"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AnimatePresence>
          {pontos.map((ponto, i) => (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              key={i} 
              className="bg-white p-6 md:p-8 rounded-3xl border border-emerald-100 shadow-sm hover:shadow-md transition-all space-y-6 flex flex-col"
            >
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  {ponto.type}
                </span>
                <button 
                  onClick={() => playPonto(ponto)}
                  className={cn(
                    "p-3 rounded-full transition-all shadow-md",
                    playing === ponto.title ? "bg-red-500 text-white shadow-red-100" : "bg-emerald-600 text-white shadow-emerald-100 hover:bg-emerald-700"
                  )}
                >
                  {playing === ponto.title ? <Pause size={20} /> : <Play size={20} />}
                </button>
              </div>
              
              <div className="space-y-4">
                <h4 className="text-xl font-bold text-emerald-900">{ponto.title}</h4>
                <div className="text-emerald-700 leading-relaxed whitespace-pre-line font-serif italic text-lg border-l-4 border-emerald-100 pl-4">
                  {ponto.lyrics}
                </div>
              </div>

              <div className="mt-auto pt-6 border-t border-emerald-50">
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Sparkles size={12} />
                  Fundamento & Significado
                </p>
                <p className="text-sm text-emerald-800 leading-relaxed">
                  {ponto.foundation}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {pontos.length === 0 && !loading && (
          <div className="md:col-span-2 py-20 text-center space-y-4">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-200">
              <Music size={40} />
            </div>
            <p className="text-emerald-400 font-medium px-6">Use a busca acima para encontrar pontos cantados.</p>
          </div>
        )}
      </div>
    </div>
  );
}
