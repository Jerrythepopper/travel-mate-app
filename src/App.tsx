import React, { useState, useEffect, useMemo } from 'react';
import { 
  MapPin, Calendar, DollarSign, BookOpen, Settings, 
  Plus, Trash2, ExternalLink, Cloud, Save, User,
  Train, Plane, Coffee, Camera, Ticket, Wallet,
  ArrowRight, Thermometer, Droplets, History, Eye, EyeOff,
  AlertCircle, CheckCircle, RefreshCw, Edit2, Users, Link as LinkIcon, CloudSun,
  Wind, Calculator, PieChart, ArrowLeftRight, Navigation, CheckSquare, X,
  Dices, Moon, Sun, Utensils, RotateCcw
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, onSnapshot, 
  query, orderBy, deleteDoc, doc, updateDoc,
  enableIndexedDbPersistence, setDoc
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth';

/**
 * 系統預設設定
 */
const DEFAULT_APP_ID = "my-travel-plan";

// 類別中文對照表
const CATEGORY_MAP = {
  'food': '餐飲',
  'transport': '交通',
  'shopping': '購物',
  'ticket': '門票',
  'stay': '住宿',
  'other': '其他'
};

// 類別顏色對照表 (Hex for Pie Chart)
const CATEGORY_COLORS = {
  'food': '#f97316',      // Orange
  'transport': '#3b82f6', // Blue
  'shopping': '#ec4899',  // Pink
  'ticket': '#a855f7',    // Purple
  'stay': '#6366f1',      // Indigo
  'other': '#64748b'      // Slate
};

// 類別顏色對照表 (Tailwind classes for Legend)
const CATEGORY_BG_CLASSES = {
  'food': 'bg-orange-500',
  'transport': 'bg-blue-500',
  'shopping': 'bg-pink-500',
  'ticket': 'bg-purple-500',
  'stay': 'bg-indigo-500',
  'other': 'bg-slate-500'
};

// --- 輔助組件 (移至最上方，確保程式讀取得懂) ---

const Card = ({ children, className = "" }) => (
  <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-4 transition-colors duration-200 ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = "primary", className = "", disabled = false, href, target = "_self" }) => {
  const baseStyle = "px-4 py-2 rounded-lg font-medium transition-all active:scale-95 flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200 dark:shadow-none",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400",
    ghost: "bg-transparent text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800",
    action: "bg-orange-500 text-white hover:bg-orange-600",
    info: "bg-cyan-500 text-white hover:bg-cyan-600",
    success: "bg-emerald-500 text-white hover:bg-emerald-600"
  };
  
  const Component = href ? 'a' : 'button';

  return (
    <Component 
      onClick={onClick} 
      disabled={disabled}
      href={href}
      target={target}
      className={`${baseStyle} ${variants[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {children}
    </Component>
  );
};

const Input = ({ label, value, onChange, type = "text", placeholder = "", list }) => (
  <div className="mb-3">
    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{label}</label>
    <input 
      type={type} 
      value={value} 
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      list={list}
      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
    />
  </div>
);

const Select = ({ label, value, onChange, options }) => (
  <div className="mb-3">
    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{label}</label>
    <select 
      value={value} 
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

const NavBtn = ({ icon, label, active, onClick, main }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center py-2 rounded-xl transition-all
      ${main ? '-mt-6 bg-blue-600 text-white shadow-lg shadow-blue-200 h-14 w-14 mx-auto dark:shadow-none dark:border-4 dark:border-slate-900' : ''}
      ${active && !main ? 'text-blue-600 bg-blue-50 dark:bg-slate-800 dark:text-blue-400' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}
    `}
  >
    {icon}
    {!main && <span className="text-[10px] font-medium mt-1">{label}</span>}
  </button>
);

// --- 核心應用程式 ---

export default function TravelApp() {
  // --- 狀態管理 ---
  const [activeTab, setActiveTab] = useState('dashboard');
  const [budgetView, setBudgetView] = useState('list');
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  
  // 資料狀態
  const [itinerary, setItinerary] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [notes, setNotes] = useState([]);
  const [checklists, setChecklists] = useState([]);
  
  // UI 狀態
  const [selectedDate, setSelectedDate] = useState(null);
  const [configMode, setConfigMode] = useState('auto');
  
  // 設定狀態
  const [firebaseConfigStr, setFirebaseConfigStr] = useState('');
  const [weatherApiKey, setWeatherApiKey] = useState('');
  const [cityName, setCityName] = useState('Tokyo'); 
  const [currencyCode, setCurrencyCode] = useState('JPY'); 
  const [weatherData, setWeatherData] = useState(null);
  const [weatherError, setWeatherError] = useState(null); 
  const [exchangeRate, setExchangeRate] = useState(null); 

  const [manualConfig, setManualConfig] = useState({
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: ''
  });
  
  // 表單與編輯狀態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState(''); 
  const [editId, setEditId] = useState(null); 
  const [formData, setFormData] = useState({});

  const [settlementPeopleCount, setSettlementPeopleCount] = useState(0);
  const [previewNote, setPreviewNote] = useState(null);
  const [previewWeather, setPreviewWeather] = useState(null);

  // 拉霸機狀態
  const [showRandomizer, setShowRandomizer] = useState(false);
  const [foodOptions, setFoodOptions] = useState([]);
  const [spinningResult, setSpinningResult] = useState(null);
  const [isSpinning, setIsSpinning] = useState(false);

  // --- 初始化邏輯 ---

  const initFirebaseConnection = async (config) => {
    try {
      if (!config) return;

      const app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
      const authInstance = getAuth(app);
      const dbInstance = getFirestore(app);
      
      setAuth(authInstance);
      setDb(dbInstance);

      await setPersistence(authInstance, browserLocalPersistence);
      await signInAnonymously(authInstance);
      
      onAuthStateChanged(authInstance, (u) => {
        setUser(u);
        setLoading(false);
      });
      return true;
    } catch (err) {
      console.error("Firebase init error:", err);
      setStatusMsg({ type: 'error', text: `連線失敗: ${err.message}` });
      setLoading(false);
      return false;
    }
  };

  // --- 初始載入 ---

  useEffect(() => {
    const loadSavedData = async () => {
      const savedConfig = localStorage.getItem('travel_firebase_config');
      const savedWeatherKey = localStorage.getItem('travel_weather_key');
      const savedCity = localStorage.getItem('travel_city_name');
      const savedCurrency = localStorage.getItem('travel_currency_code');
      const savedDarkMode = localStorage.getItem('travel_dark_mode');
      const savedFoods = localStorage.getItem('travel_food_options');
      
      if (savedConfig) setFirebaseConfigStr(savedConfig);
      if (savedWeatherKey) setWeatherApiKey(savedWeatherKey);
      if (savedCity) setCityName(savedCity);
      if (savedCurrency) setCurrencyCode(savedCurrency);
      if (savedDarkMode === 'true') setDarkMode(true);
      if (savedFoods) setFoodOptions(JSON.parse(savedFoods));
      else setFoodOptions(['拉麵', '壽司', '燒肉', '居酒屋']);

      if (savedConfig) {
        try {
          const parsed = JSON.parse(savedConfig);
          setManualConfig({
            apiKey: parsed.apiKey || '',
            authDomain: parsed.authDomain || '',
            projectId: parsed.projectId || '',
            appId: parsed.appId || ''
          });
        } catch (e) {}
      }

      let configToUse = null;
      if (typeof window.__firebase_config !== 'undefined' && window.__firebase_config) {
        configToUse = JSON.parse(window.__firebase_config);
      } else if (savedConfig) {
        try {
          configToUse = JSON.parse(savedConfig);
        } catch(e) { console.error("Saved config corrupted"); }
      }

      if (configToUse) {
        await initFirebaseConnection(configToUse);
      } else {
        setLoading(false);
      }
    };

    loadSavedData();
  }, []);

  // --- 資料監聽 ---

  useEffect(() => {
    if (!user || !db) return;

    const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : DEFAULT_APP_ID;
    const safeAppId = appId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const basePath = `artifacts/${safeAppId}/public/data`; 

    const handleSnapshotError = (err, source) => {
      console.error(`${source} Error:`, err);
      if (err.code === 'permission-denied') {
        setStatusMsg({ 
          type: 'error', 
          text: '權限不足！請到 Firebase Console 修改規則。' 
        });
      } else {
        setStatusMsg({ type: 'error', text: `${source} 讀取失敗: ${err.message}` });
      }
    };

    const unsubItinerary = onSnapshot(
      query(collection(db, basePath, 'itinerary')), 
      (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => {
          if ((a.date || '') !== (b.date || '')) return (a.date || '').localeCompare(b.date || '');
          return (a.time || '').localeCompare(b.time || '');
        });
        setItinerary(items);
      }, 
      (err) => handleSnapshotError(err, 'Itinerary')
    );

    const unsubExpenses = onSnapshot(
      query(collection(db, basePath, 'expenses')), 
      (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        setExpenses(items);
      }, 
      (err) => handleSnapshotError(err, 'Expenses')
    );

    const unsubNotes = onSnapshot(
      query(collection(db, basePath, 'notes')), 
      (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setNotes(items);
      }, 
      (err) => handleSnapshotError(err, 'Notes')
    );

    const unsubChecklists = onSnapshot(
      query(collection(db, basePath, 'checklists')), 
      (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setChecklists(items);
      }, 
      (err) => handleSnapshotError(err, 'Checklists')
    );

    return () => {
      unsubItinerary();
      unsubExpenses();
      unsubNotes();
      unsubChecklists();
    };
  }, [user, db]);

  // --- 外部 API ---

  useEffect(() => {
    if (weatherApiKey && cityName) {
      setWeatherError(null);
      fetch(`https://api.openweathermap.org/data/2.5/weather?q=${cityName}&units=metric&appid=${weatherApiKey}&lang=zh_tw`)
        .then(res => {
          if (!res.ok) throw new Error("API Key 無效或城市錯誤");
          return res.json();
        })
        .then(data => setWeatherData(data))
        .catch(err => setWeatherError(err.message));
    }
    fetch('https://api.exchangerate-api.com/v4/latest/TWD')
      .then(res => res.json())
      .then(data => setExchangeRate(data))
      .catch(err => console.error(err));
  }, [weatherApiKey, cityName]);

  // --- 功能函數 ---

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('travel_dark_mode', String(newMode));
  };

  // 拉霸機邏輯
  const handleSpin = () => {
    if (foodOptions.length === 0) return;
    setIsSpinning(true);
    setSpinningResult(null);
    
    let count = 0;
    const maxCount = 20; // 跳動次數
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * foodOptions.length);
      setSpinningResult(foodOptions[randomIndex]);
      count++;
      
      if (count >= maxCount) {
        clearInterval(interval);
        setIsSpinning(false);
      }
    }, 100);
  };

  const handleAddFoodOption = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      const newOptions = [...foodOptions, e.target.value.trim()];
      setFoodOptions(newOptions);
      localStorage.setItem('travel_food_options', JSON.stringify(newOptions));
      e.target.value = '';
    }
  };

  const handleDeleteFoodOption = (index) => {
    const newOptions = foodOptions.filter((_, i) => i !== index);
    setFoodOptions(newOptions);
    localStorage.setItem('travel_food_options', JSON.stringify(newOptions));
  };
  
  const handleClearFoodOptions = () => {
    if (confirm('確定要清空所有選項嗎？')) {
      setFoodOptions([]);
      localStorage.setItem('travel_food_options', '[]');
    }
  };

  const getMapsLinkForDay = (items) => {
    const locations = items
      .map(item => item.location)
      .filter(loc => loc && typeof loc === 'string');
    if (locations.length < 2) return null;
    const encodedRoute = locations.map(loc => encodeURIComponent(loc)).join('/');
    return `https://www.google.com/maps/dir/${encodedRoute}`;
  };

  const checkItemWeather = async (targetCity, itemTitle) => {
    if (!weatherApiKey) {
      alert("請先在設定頁面輸入 OpenWeather API Key");
      return;
    }
    const queryCity = targetCity || cityName; 
    
    try {
      setPreviewWeather({ city: queryCity, title: itemTitle, loading: true });
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${queryCity}&units=metric&appid=${weatherApiKey}&lang=zh_tw`);
      const data = await res.json();
      if (res.ok) {
        setPreviewWeather({ city: queryCity, title: itemTitle, data: data, loading: false });
      } else {
        setPreviewWeather({ city: queryCity, title: itemTitle, error: data.message, loading: false });
      }
    } catch (e) {
      setPreviewWeather({ city: queryCity, title: itemTitle, error: "連線錯誤", loading: false });
    }
  };

  const handleSaveConfig = async () => {
    setStatusMsg(null);
    let configToSave = null;
    try {
      if (configMode === 'manual') {
        if (!manualConfig.apiKey || !manualConfig.projectId) throw new Error("請填寫完整");
        configToSave = manualConfig;
      } else {
        if (!firebaseConfigStr) throw new Error("請貼上設定");
        let str = firebaseConfigStr.trim();
        if (str.includes('=')) str = str.substring(str.indexOf('=') + 1);
        if (str.endsWith(';')) str = str.slice(0, -1);
        const firstBrace = str.indexOf('{');
        const lastBrace = str.lastIndexOf('}');
        if (firstBrace !== -1) str = str.substring(firstBrace, lastBrace + 1);
        str = str.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":').replace(/'([^']*)'/g, '"$1"').replace(/,(\s*})/g, '$1');
        configToSave = JSON.parse(str);
      }
      if (!configToSave.apiKey) throw new Error("無效的設定");

      const configJson = JSON.stringify(configToSave);
      localStorage.setItem('travel_firebase_config', configJson);
      localStorage.setItem('travel_weather_key', weatherApiKey);
      localStorage.setItem('travel_city_name', cityName);
      localStorage.setItem('travel_currency_code', currencyCode);

      setStatusMsg({ type: 'success', text: '設定已儲存！正在嘗試連線...' });
      await initFirebaseConnection(configToSave);
      setStatusMsg({ type: 'success', text: '🎉 連線成功！' });

    } catch (e) {
      setStatusMsg({ type: 'error', text: e.message });
    }
  };

  const handleToggleCheckItem = async (listId, itemId, currentStatus) => {
    if (!user || !db) return;
    const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : DEFAULT_APP_ID;
    const safeAppId = appId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const basePath = `artifacts/${safeAppId}/public/data`;
    
    const list = checklists.find(l => l.id === listId);
    if (!list) return;
    const updatedItems = list.items.map(item => {
      if (item.id === itemId) return { ...item, checked: !currentStatus };
      return item;
    });
    await updateDoc(doc(db, basePath, 'checklists', listId), { items: updatedItems });
  };

  const handleAddChecklist = async () => {
    if (!user || !db) return;
    const catName = prompt("請輸入新分類名稱");
    if (!catName) return;
    const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : DEFAULT_APP_ID;
    const safeAppId = appId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const basePath = `artifacts/${safeAppId}/public/data`;
    await addDoc(collection(db, basePath, 'checklists'), { category: catName, items: [] });
  };

  const handleAddCheckItem = async (listId, e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      const newItemName = e.target.value.trim();
      e.target.value = ''; 
      if (!user || !db) return;
      const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : DEFAULT_APP_ID;
      const safeAppId = appId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const basePath = `artifacts/${safeAppId}/public/data`;
      const list = checklists.find(l => l.id === listId);
      if (!list) return;
      const updatedItems = [...(list.items || []), { id: Date.now().toString(), name: newItemName, checked: false }];
      await updateDoc(doc(db, basePath, 'checklists', listId), { items: updatedItems });
    }
  };

  const handleDeleteChecklist = async (listId) => {
    if (!confirm("確定刪除？")) return;
    const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : DEFAULT_APP_ID;
    const safeAppId = appId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const basePath = `artifacts/${safeAppId}/public/data`;
    await deleteDoc(doc(db, basePath, 'checklists', listId));
  };

  const openAddModal = (type) => {
    setModalType(type);
    setEditId(null);
    setFormData({ currency: 'TWD', payer: '我', category: 'food', type: 'sightseeing' }); 
    setIsModalOpen(true);
  };

  const openEditModal = (item, type) => {
    setModalType(type);
    setEditId(item.id);
    setFormData({...item});
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!user || !db) return;
    const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : DEFAULT_APP_ID;
    const safeAppId = appId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const basePath = `artifacts/${safeAppId}/public/data`;
    const coll = modalType === 'itinerary' ? 'itinerary' : modalType === 'expense' ? 'expenses' : 'notes';

    try {
      const data = { ...formData };
      if (modalType === 'expense') {
        data.amount = parseFloat(formData.amount || 0);
        data.splitCount = parseInt(formData.splitCount || 1);
      }
      if (editId) {
        await updateDoc(doc(db, basePath, coll, editId), data);
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(db, basePath, coll), data);
      }
      setIsModalOpen(false);
      setFormData({});
      setEditId(null);
    } catch (e) { alert("儲存失敗: " + e.message); }
  };

  const handleDelete = async (collectionName, id, e) => {
    e.stopPropagation();
    if (!confirm("確定要刪除嗎？")) return;
    const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : DEFAULT_APP_ID;
    const safeAppId = appId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const basePath = `artifacts/${safeAppId}/public/data`;
    await deleteDoc(doc(db, basePath, collectionName, id));
  };

  // --- 計算邏輯 ---

  const uniqueItineraryDates = useMemo(() => {
    const dates = [...new Set(itinerary.map(item => item.date || ''))].filter(d => d).sort();
    if (itinerary.some(item => !item.date)) dates.push('未定');
    return dates;
  }, [itinerary]);

  useEffect(() => {
    if (uniqueItineraryDates.length > 0 && !selectedDate) {
      const today = new Date().toISOString().split('T')[0];
      setSelectedDate(uniqueItineraryDates.includes(today) ? today : uniqueItineraryDates[0]);
    }
  }, [uniqueItineraryDates]);

  const filteredItineraryByDate = useMemo(() => {
    if (!selectedDate) return [];
    if (selectedDate === '未定') return itinerary.filter(item => !item.date);
    return itinerary.filter(item => item.date === selectedDate);
  }, [itinerary, selectedDate]);

  const calculateTwdAmount = (amount, currency) => {
    if (!amount) return 0;
    if (currency === 'TWD') return amount;
    if (!exchangeRate || !exchangeRate.rates[currency]) return amount; 
    return amount / exchangeRate.rates[currency];
  };

  const totalExpenseTWD = useMemo(() => {
    return expenses.reduce((acc, curr) => acc + calculateTwdAmount(curr.amount, curr.currency || 'TWD'), 0);
  }, [expenses, exchangeRate]);

  const expensesByCategory = useMemo(() => {
    const cats = {};
    expenses.forEach(e => {
      const twdVal = calculateTwdAmount(e.amount, e.currency || 'TWD');
      const catKey = e.category || 'other';
      cats[catKey] = (cats[catKey] || 0) + twdVal;
    });
    return cats;
  }, [expenses, exchangeRate]);

  const settlementData = useMemo(() => {
    const payers = {}; 
    expenses.forEach(e => {
      const payerName = e.payer || '我';
      const amountTWD = calculateTwdAmount(e.amount, e.currency || 'TWD');
      payers[payerName] = (payers[payerName] || 0) + amountTWD;
    });
    const uniquePayers = Object.keys(payers);
    const count = settlementPeopleCount > 0 ? settlementPeopleCount : (uniquePayers.length || 1);
    const average = totalExpenseTWD / count;
    return { payers, uniquePayers, count, average };
  }, [expenses, totalExpenseTWD, settlementPeopleCount, exchangeRate]);

  const existingPayers = useMemo(() => {
    const names = new Set(expenses.map(e => e.payer || '我'));
    return [...names];
  }, [expenses]);

  // --- 渲染部分 ---

  const renderPieChart = () => {
    if (totalExpenseTWD === 0) return null;
    let currentDeg = 0;
    const conicStops = Object.entries(expensesByCategory)
      .sort(([, a], [, b]) => b - a)
      .map(([cat, amount]) => {
        const pct = (amount / totalExpenseTWD) * 100;
        const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS['other'];
        const start = currentDeg;
        const end = currentDeg + pct;
        currentDeg += pct;
        return `${color} ${start}% ${end}%`;
      }).join(', ');

    return (
      <div className="flex items-center justify-between mt-4">
        <div className="relative w-24 h-24 rounded-full shrink-0 shadow-sm" style={{ background: `conic-gradient(${conicStops})` }}>
          <div className="absolute inset-0 m-auto w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-inner transition-colors">
             <span className="text-[10px] text-slate-400 font-bold">Total</span>
          </div>
        </div>
        <div className="flex-1 ml-6 grid grid-cols-2 gap-x-2 gap-y-1">
           {Object.entries(expensesByCategory).sort(([, a], [, b]) => b - a).map(([cat, amount]) => {
               const pct = ((amount / totalExpenseTWD) * 100).toFixed(0);
               if (pct === '0') return null;
               return (
                 <div key={cat} className="flex items-center gap-1.5 text-xs">
                   <div className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_BG_CLASSES[cat] || 'bg-slate-500'}`}></div>
                   <span className="text-slate-600 dark:text-slate-300 truncate">{CATEGORY_MAP[cat] || cat}</span>
                   <span className="text-slate-400 ml-auto">{pct}%</span>
                 </div>
               )
           })}
        </div>
      </div>
    );
  };

  // 命運拉霸機 Modal
  const renderRandomizerModal = () => {
    if (!showRandomizer) return null;
    return (
      <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-6 backdrop-blur-sm" onClick={() => setShowRandomizer(false)}>
        <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-2xl p-6 shadow-2xl transform transition-all" onClick={e => e.stopPropagation()}>
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center justify-center gap-2">
              <Dices className="text-orange-500" /> 命運美食
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">今天吃什麼？交給命運決定！</p>
          </div>

          {/* 拉霸顯示區 */}
          <div className="bg-slate-100 dark:bg-slate-900 h-24 rounded-xl flex items-center justify-center mb-6 border-4 border-slate-200 dark:border-slate-700 relative overflow-hidden">
             {isSpinning ? (
               <div className="text-3xl font-bold text-blue-500 animate-pulse">{spinningResult}</div>
             ) : (
               <div className="text-3xl font-bold text-slate-700 dark:text-white">
                 {spinningResult || "準備開始"}
               </div>
             )}
          </div>

          <Button onClick={handleSpin} disabled={isSpinning} variant="action" className="w-full text-lg h-12 mb-6 shadow-lg shadow-orange-200 dark:shadow-none">
            {isSpinning ? '抽選中...' : '🎰 開始拉霸！'}
          </Button>

          {/* 選項編輯區 */}
          <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs font-bold text-slate-400 uppercase">候選名單</div>
              <button onClick={handleClearFoodOptions} className="text-xs text-red-400 hover:text-red-500 flex items-center gap-1">
                <RotateCcw size={10}/> 清空
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3 max-h-32 overflow-y-auto">
              {foodOptions.map((food, idx) => (
                <span key={idx} className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-2 py-1 rounded-full text-xs flex items-center gap-1">
                  {food}
                  <button onClick={() => handleDeleteFoodOption(idx)} className="hover:text-red-500"><X size={12}/></button>
                </span>
              ))}
            </div>
            <input 
              type="text" 
              placeholder="+ 新增選項 (按 Enter)" 
              className="w-full text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 dark:text-white"
              onKeyDown={handleAddFoodOption}
            />
          </div>

          <div className="mt-4 text-center">
            <button onClick={() => setShowRandomizer(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm underline">關閉</button>
          </div>
        </div>
      </div>
    );
  };

  const renderModal = () => {
    if (!isModalOpen) return null;
    const isEdit = !!editId;
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
        <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 max-h-[90vh] overflow-y-auto transition-colors" onClick={e => e.stopPropagation()}>
          <h2 className="text-xl font-bold mb-4 text-slate-800 dark:text-white flex items-center gap-2">
            {isEdit ? <Edit2 size={20} className="text-blue-500"/> : <Plus size={20} className="text-blue-500"/>}
            {isEdit ? '編輯' : '新增'} 
            {modalType === 'itinerary' ? '行程' : modalType === 'expense' ? '支出' : '筆記'}
          </h2>
          <div className="space-y-4">
            {modalType === 'itinerary' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="日期" type="date" value={formData.date || ''} onChange={v => setFormData({...formData, date: v})} />
                  <Input label="時間" type="time" value={formData.time || ''} onChange={v => setFormData({...formData, time: v})} />
                </div>
                <Input label="活動名稱" value={formData.title || ''} onChange={v => setFormData({...formData, title: v})} placeholder="例如：晴空塔參觀" />
                <Select label="類型" value={formData.type || 'sightseeing'} onChange={v => setFormData({...formData, type: v})} 
                  options={[ {value: 'sightseeing', label: '景點'}, {value: 'food', label: '美食'}, {value: 'transport', label: '交通'}, {value: 'shopping', label: '購物'}, {value: 'flight', label: '飛機'}, {value: 'stay', label: '住宿'} ]} 
                />
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">連結票券</label>
                  <select value={formData.linkedNoteId || ''} onChange={(e) => setFormData({...formData, linkedNoteId: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
                    <option value="">-- 無連結 --</option>
                    {notes.map(note => (<option key={note.id} value={note.id}>{note.title}</option>))}
                  </select>
                </div>
                <Input label="天氣查詢城市" value={formData.weatherCity || ''} onChange={v => setFormData({...formData, weatherCity: v})} placeholder="例如: Tainan" />
                <Input label="地點/備註" value={formData.location || ''} onChange={v => setFormData({...formData, location: v})} placeholder="例如：地鐵站出口3" />
                <Input label="Google Map 連結" value={formData.mapLink || ''} onChange={v => setFormData({...formData, mapLink: v})} placeholder="https://maps..." />
              </>
            )}
            {modalType === 'expense' && (
              <>
                 <div className="grid grid-cols-2 gap-3">
                  <Input label="日期" type="date" value={formData.date || ''} onChange={v => setFormData({...formData, date: v})} />
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">幣別</label>
                    <select value={formData.currency || 'TWD'} onChange={(e) => setFormData({...formData, currency: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {['TWD', 'JPY', 'KRW', 'USD', 'EUR', 'CNY', 'THB'].map(c => (<option key={c} value={c}>{c}</option>))}
                    </select>
                  </div>
                </div>
                <Input label="金額" type="number" value={formData.amount || ''} onChange={v => setFormData({...formData, amount: v})} placeholder="0.00" />
                {formData.currency && formData.currency !== 'TWD' && formData.amount && exchangeRate && (
                   <p className="text-xs text-slate-500 dark:text-slate-400 text-right -mt-2 mb-2">約合 {Math.round(calculateTwdAmount(parseFloat(formData.amount), formData.currency))} TWD</p>
                )}
                <Input label="項目名稱" value={formData.title || ''} onChange={v => setFormData({...formData, title: v})} placeholder="午餐..." />
                <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-700 p-3 rounded-lg border border-slate-200 dark:border-slate-600">
                  <div>
                     <label className="text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider block mb-1">付款人</label>
                     <input type="text" list="payer-list" value={formData.payer || '我'} onChange={(e) => setFormData({...formData, payer: e.target.value})} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 dark:text-white" />
                     <datalist id="payer-list">{existingPayers.map(p => <option key={p} value={p} />)}</datalist>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1 mb-1"><Users size={12}/> 分帳人數</label>
                     <input type="number" min="1" value={formData.splitCount || 1} onChange={(e) => setFormData({...formData, splitCount: e.target.value})} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 dark:text-white" />
                  </div>
                </div>
                <Select label="類別" value={formData.category || 'food'} onChange={v => setFormData({...formData, category: v})} options={Object.entries(CATEGORY_MAP).map(([k, v]) => ({ value: k, label: v }))} />
              </>
            )}
            {modalType === 'note' && (
              <>
                <Input label="標題" value={formData.title || ''} onChange={v => setFormData({...formData, title: v})} />
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">內容</label>
                  <textarea className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 h-24 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" value={formData.content || ''} onChange={e => setFormData({...formData, content: e.target.value})}></textarea>
                </div>
                <Input label="連結" value={formData.link || ''} onChange={v => setFormData({...formData, link: v})} />
              </>
            )}
          </div>
          <div className="flex gap-3 mt-6">
            <Button variant="secondary" className="flex-1" onClick={() => setIsModalOpen(false)}>取消</Button>
            <Button variant="primary" className="flex-1" onClick={handleSubmit}>儲存</Button>
          </div>
        </div>
      </div>
    );
  };

  const renderPreviewNoteModal = () => {
    if (!previewNote) return null;
    return (
      <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-6 backdrop-blur-sm" onClick={() => setPreviewNote(null)}>
        <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
          <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
            <Ticket className="text-purple-500" />
            {previewNote.title}
          </h3>
          <div className="bg-slate-50 p-4 rounded-lg text-slate-600 text-sm whitespace-pre-wrap mb-4 max-h-[40vh] overflow-y-auto">
            {previewNote.content || "無內容"}
          </div>
          {previewNote.link && (
            <a href={previewNote.link} target="_blank" className="block w-full text-center bg-blue-600 text-white py-2 rounded-lg mb-4 hover:bg-blue-700">
              開啟連結/附件
            </a>
          )}
          <Button variant="secondary" className="w-full" onClick={() => setPreviewNote(null)}>關閉</Button>
        </div>
      </div>
    );
  };

  const renderWeatherModal = () => {
    if (!previewWeather) return null;
    const { city, title, data, error, loading } = previewWeather;

    return (
      <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-6 backdrop-blur-sm" onClick={() => setPreviewWeather(null)}>
        <div className="bg-white w-full max-w-xs rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="bg-blue-500 text-white p-4">
             <h3 className="text-lg font-bold flex items-center gap-2">
               <MapPin size={18}/> {title}
             </h3>
             <p className="text-blue-100 text-xs">{city}</p>
          </div>
          
          <div className="p-6 text-center">
            {loading ? (
              <div className="py-4 flex flex-col items-center text-slate-400">
                <RefreshCw size={32} className="animate-spin mb-2" />
                <p>天氣查詢中...</p>
              </div>
            ) : error ? (
              <div className="py-4 text-red-500">
                <AlertCircle size={32} className="mx-auto mb-2" />
                <p>{error}</p>
              </div>
            ) : (
              <>
                <img 
                  src={`https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`} 
                  className="w-24 h-24 mx-auto -mt-4" 
                  alt="weather icon"
                />
                <h2 className="text-5xl font-bold text-slate-800 mb-2">{Math.round(data.main.temp)}°</h2>
                <p className="text-slate-500 capitalize mb-6">{data.weather[0].description}</p>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-slate-50 p-2 rounded-lg">
                    <p className="text-slate-400 text-xs mb-1">體感</p>
                    <p className="font-bold text-slate-700">{Math.round(data.main.feels_like)}°</p>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg">
                    <p className="text-slate-400 text-xs mb-1">濕度</p>
                    <p className="font-bold text-slate-700">{data.main.humidity}%</p>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="p-4 border-t border-slate-100">
             <Button variant="secondary" className="w-full" onClick={() => setPreviewWeather(null)}>關閉</Button>
          </div>
        </div>
      </div>
    );
  };

  // --- Main Return ---

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-400"><div className="animate-spin mr-2"><Settings size={20}/></div></div>;

  if (!db && !window.__firebase_config) {
     return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 flex flex-col items-center justify-center max-w-lg mx-auto transition-colors">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl w-full">
           <div className="flex justify-center mb-6"><div className="bg-blue-100 dark:bg-blue-900 p-4 rounded-full"><Plane size={40} className="text-blue-600 dark:text-blue-400" /></div></div>
           <h1 className="text-2xl font-bold text-center mb-2 text-slate-800 dark:text-white">歡迎使用 TravelMate</h1>
           <p className="text-center text-slate-500 dark:text-slate-400 mb-6">請設定您的雲端資料庫。</p>
           {statusMsg && (<div className={`mb-6 p-4 rounded-lg flex items-start gap-3 text-sm ${statusMsg.type === 'error' ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'}`}>{statusMsg.type === 'error' ? <AlertCircle size={18} className="mt-0.5" /> : <CheckCircle size={18} className="mt-0.5" />}<div>{statusMsg.text}</div></div>)}
           <div className="flex gap-2 mb-4"><button onClick={() => setConfigMode('auto')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${configMode === 'auto' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>自動貼上</button><button onClick={() => setConfigMode('manual')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${configMode === 'manual' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>手動輸入</button></div>
           <div className="space-y-4">
            {configMode === 'auto' ? (<div><label className="block text-sm font-medium mb-1 dark:text-white">Firebase Config</label><textarea className="w-full h-32 text-xs font-mono bg-slate-100 dark:bg-slate-900 border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white" value={firebaseConfigStr} onChange={e => setFirebaseConfigStr(e.target.value)} placeholder='const firebaseConfig = { ... }' /></div>) : (<div className="space-y-3 bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700"><Input label="API Key" value={manualConfig.apiKey} onChange={v => setManualConfig({...manualConfig, apiKey: v})} /><Input label="Project ID" value={manualConfig.projectId} onChange={v => setManualConfig({...manualConfig, projectId: v})} /><Input label="Auth Domain" value={manualConfig.authDomain} onChange={v => setManualConfig({...manualConfig, authDomain: v})} /><Input label="App ID" value={manualConfig.appId} onChange={v => setManualConfig({...manualConfig, appId: v})} /></div>)}
            <Button onClick={handleSaveConfig} className="w-full">儲存並開始</Button>
           </div>
        </div>
      </div>
     )
  }

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20 font-sans text-slate-800 dark:text-slate-100 transition-colors duration-300">
        {/* 頂部導航 */}
        <div className="bg-blue-600 dark:bg-slate-900 text-white p-4 sticky top-0 z-40 shadow-md transition-colors">
          <div className="flex justify-between items-center max-w-md mx-auto">
            <div className="flex items-center gap-2">
              <Plane size={20} />
              <h1 className="font-bold text-lg">TravelMate</h1>
            </div>
            <div className="flex gap-3 items-center">
               <div className="text-xs bg-emerald-600/90 px-3 py-1 rounded-full flex items-center gap-1 shadow-sm border border-emerald-400/50 font-medium text-white">
                 <Users size={12}/> 共享模式
               </div>
            </div>
          </div>
        </div>

        <div className="max-w-md mx-auto p-4 space-y-6">
          {activeTab === 'dashboard' && (
            <div className="space-y-4 animate-in fade-in">
              {/* Weather Card */}
              <Card className="bg-gradient-to-br from-blue-400 to-indigo-500 dark:from-blue-900 dark:to-indigo-950 text-white border-none overflow-hidden relative">
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2"><MapPin size={18} /><span className="font-bold text-lg">{cityName}</span></div>
                    {weatherData && (<div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm"><img src={`https://openweathermap.org/img/wn/${weatherData.weather[0].icon}.png`} className="w-8 h-8" alt="weather"/></div>)}
                  </div>
                  {weatherData ? (
                    <>
                      <div className="flex items-end gap-2 mb-2"><h2 className="text-5xl font-bold">{Math.round(weatherData.main.temp)}°</h2><span className="text-xl mb-1 opacity-90">{weatherData.weather[0].description}</span></div>
                      <div className="flex gap-4 text-sm opacity-90"><div className="flex items-center gap-1"><Droplets size={14} /> {weatherData.main.humidity}%</div><div className="flex items-center gap-1"><Wind size={14} /> {weatherData.wind.speed} m/s</div></div>
                    </>
                  ) : (<div className="py-4 text-sm opacity-70">載入天氣中...</div>)}
                </div>
                <CloudSun size={120} className="absolute -right-6 -bottom-6 text-white/10" />
              </Card>
              
              {/* Random Food Button */}
              <Button onClick={() => setShowRandomizer(true)} variant="action" className="w-full shadow-lg shadow-orange-200 dark:shadow-none h-12 text-lg">
                 <Dices className="mr-2" /> 幫我選！今天要吃什麼？
              </Button>

              <div className="grid grid-cols-2 gap-4">
                <Card className="flex flex-col items-center justify-center py-6"><Calendar className="text-blue-500 mb-2" size={28} /><span className="text-2xl font-bold">{itinerary.length}</span><span className="text-xs text-slate-400 uppercase">行程活動</span></Card>
                <Card className="flex flex-col items-center justify-center py-6"><Wallet className="text-emerald-500 mb-2" size={28} /><span className="text-2xl font-bold"><span className="text-sm align-top">$</span>{Math.round(totalExpenseTWD).toLocaleString()}</span><span className="text-xs text-slate-400 uppercase">總支出 (約合 TWD)</span></Card>
              </div>
            </div>
          )}

          {activeTab === 'itinerary' && (
             <div className="space-y-6 animate-in fade-in">
               <div className="flex justify-between items-center"><h2 className="text-xl font-bold">行程規劃</h2><Button onClick={() => openAddModal('itinerary')} className="h-10 w-10 !p-0 rounded-full"><Plus size={24} /></Button></div>
               <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
                {uniqueItineraryDates.map(date => (
                  <button key={date} onClick={() => setSelectedDate(date)} className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-colors whitespace-nowrap ${selectedDate === date ? 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'}`}>{date}</button>
                ))}
              </div>
              <div className="space-y-3">
                  <div className="flex justify-between items-center"><h3 className="font-bold text-slate-700 dark:text-slate-300">{selectedDate || '請選擇日期'}</h3>{filteredItineraryByDate.length >= 2 && getMapsLinkForDay(filteredItineraryByDate) && (<Button href={getMapsLinkForDay(filteredItineraryByDate)} target="_blank" variant="action" className="!py-1 !px-3 text-xs h-8"><Navigation size={14} /> 地圖路線</Button>)}</div>
                  {filteredItineraryByDate.map((item) => (
                     <div key={item.id} onClick={() => openEditModal(item, 'itinerary')} className="relative bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 group cursor-pointer"><div className="absolute -left-[21px] top-6 w-3 h-3 rounded-full border-2 border-slate-50 dark:border-slate-950 bg-blue-500"></div><div className="flex justify-between items-start"><div className="flex-1"><div className="flex items-center gap-2 mb-1"><span className="font-mono font-bold text-slate-600 dark:text-slate-300 text-lg">{item.time}</span><span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300`}>{item.type}</span></div><h4 className="font-bold text-slate-800 dark:text-white text-lg">{item.title}</h4><div className="flex flex-wrap gap-2 mt-1">{item.location && (<p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1"><MapPin size={14} /> {item.location}</p>)}<div className="flex items-center gap-2 mt-1" onClick={(e) => e.stopPropagation()}><button onClick={(e) => { e.stopPropagation(); checkItemWeather(item.weatherCity, item.title); }} className="inline-flex items-center gap-1 text-xs text-orange-600 hover:bg-orange-100 dark:text-orange-400 dark:hover:bg-orange-900 bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded border border-orange-100 dark:border-orange-900 transition-colors"><CloudSun size={12} /> 天氣</button></div></div></div><button onClick={(e) => handleDelete('itinerary', item.id, e)} className="text-slate-300 hover:text-red-500 p-2"><Trash2 size={16} /></button></div></div>
                  ))}
              </div>
             </div>
          )}

          {activeTab === 'budget' && budgetView === 'list' && (
            <div className="space-y-4 animate-in fade-in">
               <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">支出記帳</h2>
                <div className="flex gap-2">
                  <Button variant="secondary" className="h-10 !px-3 text-sm" onClick={() => setBudgetView('settlement')}><PieChart size={18} className="mr-1" /> 結算</Button>
                  <Button onClick={() => openAddModal('expense')} className="h-10 w-10 !p-0 rounded-full"><Plus size={24} /></Button>
                </div>
              </div>
              {/* White Card for Total Expense */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 transition-colors">
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">總花費 (估計台幣)</p>
                  <h3 className="text-4xl font-bold text-slate-800 dark:text-white mt-1"><span className="text-xl align-top mr-1">$</span>{Math.round(totalExpenseTWD).toLocaleString()}</h3>
                </div>
                {renderPieChart()}
              </div>
              <div className="space-y-2">
                {expenses.map(item => (
                  <div key={item.id} onClick={() => openEditModal(item, 'expense')} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white ${CATEGORY_BG_CLASSES[item.category] || 'bg-slate-500'}`}><DollarSign size={20} /></div>
                      <div><h4 className="font-medium text-sm text-slate-800 dark:text-white">{item.title}</h4><p className="text-xs text-slate-400 flex items-center gap-2">{item.date} • {item.payer || '我'}付</p></div>
                    </div>
                    <div className="text-right"><span className="font-bold text-slate-800 dark:text-white block">{item.currency} {item.amount.toLocaleString()}</span>{item.currency !== 'TWD' && exchangeRate && (<span className="text-[10px] text-slate-400 block">≈ {Math.round(calculateTwdAmount(item.amount, item.currency)).toLocaleString()}</span>)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Settings with Dark Mode Toggle */}
          {activeTab === 'settings' && (
             <div className="space-y-6 animate-in fade-in">
               <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold">App 設定</h2>
                  <div className="flex items-center gap-2">
                     <span className="text-xs text-slate-400">深色模式</span>
                     <button onClick={toggleDarkMode} className={`w-12 h-6 rounded-full p-1 transition-colors ${darkMode ? 'bg-blue-600' : 'bg-slate-300'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${darkMode ? 'translate-x-6' : ''}`}></div>
                     </button>
                  </div>
               </div>
               {/* ... (Settings content) ... */}
               <Card><h3 className="font-bold mb-4 flex items-center gap-2 text-slate-700 dark:text-slate-200"><Cloud size={18} /> 連線設定</h3><div className="space-y-4"><Input label="預設城市" value={cityName} onChange={setCityName} /><Input label="Weather API Key" type="password" value={weatherApiKey} onChange={setWeatherApiKey} /><Button onClick={handleSaveConfig} className="w-full mt-4">儲存設定</Button></div></Card>
               <div className="text-center text-xs text-slate-400 mt-8">TravelMate v7.0 • 您的個人旅遊助手</div>
             </div>
          )}

          {/* Other tabs omitted for brevity but logic persists... */}
          {activeTab === 'budget' && budgetView === 'settlement' && (
             /* Reuse settlement view logic but add dark mode classes */
             <div className="space-y-6 animate-in fade-in">
               <div className="flex items-center gap-2 mb-2"><button onClick={() => setBudgetView('list')} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><ArrowLeftRight size={20} /></button><h2 className="text-xl font-bold">分帳結算</h2></div>
               <Card className="bg-indigo-600 text-white"><div className="flex justify-between items-end"><div><p className="text-indigo-200 text-xs">總旅費 (TWD)</p><h3 className="text-3xl font-bold">${Math.round(totalExpenseTWD).toLocaleString()}</h3></div><div className="text-right"><p className="text-indigo-200 text-xs">平均每人</p><h3 className="text-2xl font-bold">${Math.round(settlementData.average).toLocaleString()}</h3></div></div></Card>
               <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700"><div className="space-y-3">{settlementData.uniquePayers.map(payer => {const paid = settlementData.payers[payer]; const diff = paid - settlementData.average; return (<div key={payer} className="flex justify-between items-center border-b border-slate-50 dark:border-slate-700 pb-2 last:border-0"><div><span className="font-bold text-slate-800 dark:text-white">{payer}</span><span className="text-xs text-slate-400 block">已付 ${Math.round(paid).toLocaleString()}</span></div><div className={`text-right font-bold ${diff >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{diff >= 0 ? '應收' : '應付'} ${Math.abs(Math.round(diff)).toLocaleString()}</div></div>)})}</div></div>
             </div>
          )}

          {activeTab === 'docs' && (
             <div className="space-y-6 animate-in fade-in">
               <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">清單與票券</h2><div className="flex gap-2"><Button onClick={() => handleAddChecklist()} className="h-9 px-3 text-xs bg-emerald-600 hover:bg-emerald-700"><Plus size={16} className="mr-1"/> 新清單</Button><Button onClick={() => openAddModal('note')} className="h-9 w-9 !p-0 rounded-full"><Plus size={20} /></Button></div></div>
               {checklists.map(list => (<Card key={list.id} className="relative group"><div className="flex justify-between items-center mb-3"><h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2"><CheckSquare size={18} className="text-emerald-500"/>{list.category}</h3><button onClick={() => handleDeleteChecklist(list.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button></div><div className="space-y-2 mb-3">{list.items && list.items.map(item => (<div key={item.id} className="flex items-center gap-2"><input type="checkbox" checked={item.checked} onChange={() => handleToggleCheckItem(list.id, item.id, item.checked)} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"/><span className={`text-sm ${item.checked ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-300'}`}>{item.name}</span></div>))}</div><input type="text" placeholder="+ 新增項目 (按 Enter)" className="w-full text-sm bg-slate-50 dark:bg-slate-900 border-none rounded px-2 py-1 focus:ring-1 focus:ring-emerald-500 dark:text-white" onKeyDown={(e) => handleAddCheckItem(list.id, e)}/></Card>))}
               <div className="grid grid-cols-1 gap-4">{notes.map(note => (<Card key={note.id} className="relative group"><div className="flex items-start gap-3"><Ticket className="text-purple-500 shrink-0 mt-1" size={20} /><div className="flex-1 overflow-hidden" onClick={() => openEditModal(note, 'note')}><h3 className="font-bold text-lg mb-1 cursor-pointer hover:text-blue-600 dark:text-white dark:hover:text-blue-400">{note.title}</h3><p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap cursor-pointer">{note.content}</p></div><button onClick={(e) => handleDelete('notes', note.id, e)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button></div></Card>))}</div>
             </div>
          )}

        </div>

        {/* 底部導航欄 */}
        <div className="fixed bottom-0 w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-2 pb-safe z-50 transition-colors">
          <div className="max-w-md mx-auto grid grid-cols-5 gap-1">
            <NavBtn icon={<Calendar size={20} />} label="行程" active={activeTab === 'itinerary'} onClick={() => setActiveTab('itinerary')} />
            <NavBtn icon={<DollarSign size={20} />} label="記帳" active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} />
            <NavBtn icon={<MapPin size={24} />} label="首頁" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} main />
            <NavBtn icon={<Ticket size={20} />} label="票券" active={activeTab === 'docs'} onClick={() => setActiveTab('docs')} />
            <NavBtn icon={<Settings size={20} />} label="設定" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          </div>
        </div>

        {renderModal()}
        {renderPreviewNoteModal()}
        {renderWeatherModal()}
        {renderRandomizerModal()}
      </div>
    </div>
  );
}