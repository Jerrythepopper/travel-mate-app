import React, { useState, useEffect, useMemo } from 'react';
import { 
  MapPin, Calendar, DollarSign, BookOpen, Settings, 
  Plus, Trash2, ExternalLink, Cloud, Save, User,
  Train, Plane, Coffee, Camera, Ticket, Wallet,
  ArrowRight, Thermometer, Droplets, History, Eye, EyeOff,
  AlertCircle, CheckCircle, RefreshCw, Edit2, Users, Link as LinkIcon, CloudSun,
  Wind, Calculator, PieChart, ArrowLeftRight, Navigation, CheckSquare, X
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

// --- 輔助組件 ---

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-100 p-4 ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = "primary", className = "", disabled = false, href, target = "_self" }) => {
  const baseStyle = "px-4 py-2 rounded-lg font-medium transition-all active:scale-95 flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
    ghost: "bg-transparent text-slate-500 hover:bg-slate-50",
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
    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
    <input 
      type={type} 
      value={value} 
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      list={list}
      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
    />
  </div>
);

const Select = ({ label, value, onChange, options }) => (
  <div className="mb-3">
    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
    <select 
      value={value} 
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

// --- 核心應用程式 ---

export default function TravelApp() {
  // --- 狀態管理 ---
  const [activeTab, setActiveTab] = useState('dashboard');
  const [budgetView, setBudgetView] = useState('list'); // 'list' | 'settlement'
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState(null);
  
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

  // 手動設定狀態
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

  // 結算設定
  const [settlementPeopleCount, setSettlementPeopleCount] = useState(0);

  // 臨時狀態
  const [previewNote, setPreviewNote] = useState(null);
  const [previewWeather, setPreviewWeather] = useState(null);

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
      
      if (savedConfig) setFirebaseConfigStr(savedConfig);
      if (savedWeatherKey) setWeatherApiKey(savedWeatherKey);
      if (savedCity) setCityName(savedCity);
      if (savedCurrency) setCurrencyCode(savedCurrency);

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
    const basePath = `artifacts/${safeAppId}/public/data`; // 使用公共路徑

    // 錯誤處理 helper
    const handleSnapshotError = (err, source) => {
      console.error(`${source} Error:`, err);
      if (err.code === 'permission-denied') {
        setStatusMsg({ 
          type: 'error', 
          text: '權限不足！請到 Firebase Console -> Firestore Database -> Rules，將規則改成 allow read, write: if request.auth != null;' 
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

  // --- 外部 API (天氣與匯率) ---

  useEffect(() => {
    if (weatherApiKey && cityName) {
      setWeatherError(null);
      fetch(`https://api.openweathermap.org/data/2.5/weather?q=${cityName}&units=metric&appid=${weatherApiKey}&lang=zh_tw`)
        .then(res => {
          if (!res.ok) throw new Error(res.status === 401 ? "API Key 無效或未開通" : "找不到該城市");
          return res.json();
        })
        .then(data => {
          setWeatherData(data);
        })
        .catch(err => {
          console.error("Weather Error", err);
          setWeatherError(err.message);
        });
    } else if (!weatherApiKey) {
       setWeatherError("未設定 API Key");
    }

    fetch('https://api.exchangerate-api.com/v4/latest/TWD')
      .then(res => res.json())
      .then(data => setExchangeRate(data))
      .catch(err => console.error("Forex Error", err));
  }, [weatherApiKey, cityName]);

  // --- 功能函數 ---

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
        setPreviewWeather({
          city: queryCity,
          title: itemTitle,
          data: data,
          loading: false
        });
      } else {
        setPreviewWeather({ city: queryCity, title: itemTitle, error: data.message, loading: false });
      }
    } catch (e) {
      setPreviewWeather({ city: queryCity, title: itemTitle, error: "連線錯誤", loading: false });
    }
  };

  const parseFirebaseConfig = (inputStr) => {
    try {
      let str = inputStr.trim();
      if (str.includes('=')) str = str.substring(str.indexOf('=') + 1);
      if (str.endsWith(';')) str = str.slice(0, -1);
      
      const firstBrace = str.indexOf('{');
      const lastBrace = str.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        str = str.substring(firstBrace, lastBrace + 1);
      }
      
      str = str.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":');
      str = str.replace(/'([^']*)'/g, '"$1"');
      str = str.replace(/,(\s*})/g, '$1');

      return JSON.parse(str);
    } catch (e) {
      throw new Error("格式解析失敗，請嘗試手動輸入模式。");
    }
  };

  const handleSaveConfig = async () => {
    setStatusMsg(null);
    let configToSave = null;

    try {
      if (configMode === 'manual') {
        if (!manualConfig.apiKey || !manualConfig.projectId) {
          throw new Error("請填寫完整的 API Key 和 Project ID");
        }
        configToSave = manualConfig;
      } else {
        if (!firebaseConfigStr) throw new Error("請貼上設定內容");
        configToSave = parseFirebaseConfig(firebaseConfigStr);
      }

      if (!configToSave.apiKey) throw new Error("設定中找不到 apiKey");

      const configJson = JSON.stringify(configToSave);
      localStorage.setItem('travel_firebase_config', configJson);
      localStorage.setItem('travel_weather_key', weatherApiKey);
      localStorage.setItem('travel_city_name', cityName);
      localStorage.setItem('travel_currency_code', currencyCode);

      setStatusMsg({ type: 'success', text: '設定已儲存！正在嘗試連線...' });
      const success = await initFirebaseConnection(configToSave);
      
      if (success) {
        setStatusMsg({ type: 'success', text: '🎉 連線成功！' });
        initDefaultChecklists(configToSave);
      }

    } catch (e) {
      setStatusMsg({ type: 'error', text: e.message });
    }
  };

  const initDefaultChecklists = async (config) => {};

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
    const catName = prompt("請輸入新分類名稱（例如：電器用品）");
    if (!catName) return;

    const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : DEFAULT_APP_ID;
    const safeAppId = appId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const basePath = `artifacts/${safeAppId}/public/data`;

    await addDoc(collection(db, basePath, 'checklists'), {
      category: catName,
      items: []
    });
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

      const newItem = { id: Date.now().toString(), name: newItemName, checked: false };
      const updatedItems = [...(list.items || []), newItem];

      await updateDoc(doc(db, basePath, 'checklists', listId), { items: updatedItems });
    }
  };

  const handleDeleteChecklist = async (listId) => {
    if (!confirm("確定要刪除這個分類清單嗎？")) return;
    const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : DEFAULT_APP_ID;
    const safeAppId = appId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const basePath = `artifacts/${safeAppId}/public/data`;
    await deleteDoc(doc(db, basePath, 'checklists', listId));
  };

  const openAddModal = (type) => {
    setModalType(type);
    setEditId(null);
    setFormData({ currency: 'TWD', payer: '我' }); 
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
        data.currency = formData.currency || 'TWD';
        data.payer = formData.payer || '我';
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
    } catch (e) {
      alert("儲存失敗: " + e.message);
    }
  };

  const handleDelete = async (collectionName, id, e) => {
    e.stopPropagation();
    if (!confirm("確定要刪除嗎？")) return;
    const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : DEFAULT_APP_ID;
    const safeAppId = appId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const basePath = `artifacts/${safeAppId}/public/data`;
    await deleteDoc(doc(db, basePath, collectionName, id));
  };

  const handleShowLinkedNote = (noteId, e) => {
    e.stopPropagation();
    const note = notes.find(n => n.id === noteId);
    if (note) {
      setPreviewNote(note);
    } else {
      alert("找不到連結的票券資料，可能已被刪除。");
    }
  };

  // --- 計算邏輯 (Itinerary Dates) ---
  const uniqueItineraryDates = useMemo(() => {
    const dates = [...new Set(itinerary.map(item => item.date || ''))].filter(d => d).sort();
    if (itinerary.some(item => !item.date)) {
      dates.push('未定');
    }
    return dates;
  }, [itinerary]);

  useEffect(() => {
    if (uniqueItineraryDates.length > 0 && !selectedDate) {
      const today = new Date().toISOString().split('T')[0];
      if (uniqueItineraryDates.includes(today)) {
        setSelectedDate(today);
      } else {
        setSelectedDate(uniqueItineraryDates[0]);
      }
    }
  }, [uniqueItineraryDates]);

  const filteredItineraryByDate = useMemo(() => {
    if (!selectedDate) return [];
    if (selectedDate === '未定') {
      return itinerary.filter(item => !item.date);
    }
    return itinerary.filter(item => item.date === selectedDate);
  }, [itinerary, selectedDate]);


  // --- 計算邏輯 (Expenses & Settlement) ---

  const calculateTwdAmount = (amount, currency) => {
    if (!amount) return 0;
    if (currency === 'TWD') return amount;
    if (!exchangeRate || !exchangeRate.rates[currency]) return amount; 
    return amount / exchangeRate.rates[currency];
  };

  const totalExpenseTWD = useMemo(() => {
    return expenses.reduce((acc, curr) => {
      return acc + calculateTwdAmount(curr.amount, curr.currency || 'TWD');
    }, 0);
  }, [expenses, exchangeRate]);

  const expensesByCategory = useMemo(() => {
    const cats = {};
    expenses.forEach(e => {
      const twdVal = calculateTwdAmount(e.amount, e.currency || 'TWD');
      cats[e.category] = (cats[e.category] || 0) + twdVal;
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

    return {
      payers,
      uniquePayers,
      count,
      average
    };
  }, [expenses, totalExpenseTWD, settlementPeopleCount, exchangeRate]);

  const existingPayers = useMemo(() => {
    const names = new Set(expenses.map(e => e.payer || '我'));
    return [...names];
  }, [expenses]);

  // --- 渲染組件 ---

  const renderModal = () => {
    if (!isModalOpen) return null;
    const isEdit = !!editId;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
        <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <h2 className="text-xl font-bold mb-4 text-slate-800 flex items-center gap-2">
            {isEdit ? <Edit2 size={20} className="text-blue-500"/> : <Plus size={20} className="text-blue-500"/>}
            {isEdit ? '編輯' : '新增'} 
            {modalType === 'itinerary' ? '行程' : 
             modalType === 'expense' ? '支出' : '筆記'}
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
                  options={[
                    {value: 'sightseeing', label: '景點'},
                    {value: 'food', label: '美食'},
                    {value: 'transport', label: '交通'},
                    {value: 'shopping', label: '購物'},
                    {value: 'flight', label: '飛機'},
                    {value: 'stay', label: '住宿'},
                  ]} 
                />
                
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">連結票券/筆記</label>
                  <select 
                    value={formData.linkedNoteId || ''} 
                    onChange={(e) => setFormData({...formData, linkedNoteId: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  >
                    <option value="">-- 無連結 --</option>
                    {notes.map(note => (
                      <option key={note.id} value={note.id}>{note.title}</option>
                    ))}
                  </select>
                </div>

                <Input label="天氣查詢城市 (留空則使用全域設定)" value={formData.weatherCity || ''} onChange={v => setFormData({...formData, weatherCity: v})} placeholder="例如: Tainan 或 Osaka" />

                <Input label="地點/備註" value={formData.location || ''} onChange={v => setFormData({...formData, location: v})} placeholder="例如：地鐵站出口3" />
                <Input label="Google Map 連結 (選填)" value={formData.mapLink || ''} onChange={v => setFormData({...formData, mapLink: v})} placeholder="https://maps.app.goo.gl/..." />
              </>
            )}

            {modalType === 'expense' && (
              <>
                 <div className="grid grid-cols-2 gap-3">
                  <Input label="日期" type="date" value={formData.date || ''} onChange={v => setFormData({...formData, date: v})} />
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">幣別</label>
                    <select 
                      value={formData.currency || 'TWD'} 
                      onChange={(e) => setFormData({...formData, currency: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    >
                      {['TWD', 'JPY', 'KRW', 'USD', 'EUR', 'CNY', 'THB'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <Input label="金額" type="number" value={formData.amount || ''} onChange={v => setFormData({...formData, amount: v})} placeholder="0.00" />
                
                {formData.currency && formData.currency !== 'TWD' && formData.amount && exchangeRate && (
                   <p className="text-xs text-slate-500 text-right -mt-2 mb-2">
                     約合 {Math.round(calculateTwdAmount(parseFloat(formData.amount), formData.currency))} TWD 
                     (匯率: {(1 / exchangeRate.rates[formData.currency]).toFixed(4)})
                   </p>
                )}

                <Input label="項目名稱" value={formData.title || ''} onChange={v => setFormData({...formData, title: v})} placeholder="午餐、車票..." />
                
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div>
                     <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                       付款人
                     </label>
                     <input 
                       type="text" 
                       list="payer-list"
                       value={formData.payer || '我'} 
                       onChange={(e) => setFormData({...formData, payer: e.target.value})}
                       className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2"
                     />
                     {/* 自動建議清單 */}
                     <datalist id="payer-list">
                        {existingPayers.map(p => <option key={p} value={p} />)}
                     </datalist>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                       <Users size={12}/> 分帳人數
                     </label>
                     <input 
                       type="number" 
                       min="1"
                       value={formData.splitCount || 1} 
                       onChange={(e) => setFormData({...formData, splitCount: e.target.value})}
                       className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2"
                     />
                  </div>
                  
                  {parseInt(formData.splitCount) > 1 && formData.amount > 0 && (
                    <div className="col-span-2 text-right">
                       <p className="text-xs text-blue-600 font-bold">
                         平均一人: {formData.currency || 'TWD'} {(formData.amount / parseInt(formData.splitCount)).toFixed(1)}
                       </p>
                    </div>
                  )}
                </div>

                <Select label="類別" value={formData.category || 'food'} onChange={v => setFormData({...formData, category: v})} 
                  options={[
                    {value: 'food', label: '餐飲'},
                    {value: 'transport', label: '交通'},
                    {value: 'shopping', label: '購物'},
                    {value: 'ticket', label: '門票'},
                    {value: 'stay', label: '住宿'},
                  ]} 
                />
              </>
            )}

            {modalType === 'note' && (
              <>
                <Input label="標題" value={formData.title || ''} onChange={v => setFormData({...formData, title: v})} placeholder="例如：機票號碼" />
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">內容 / 筆記</label>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 h-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.content || ''}
                    onChange={e => setFormData({...formData, content: e.target.value})}
                  ></textarea>
                </div>
                <Input label="連結 (票券PDF或圖片連結)" value={formData.link || ''} onChange={v => setFormData({...formData, link: v})} placeholder="https://..." />
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

  // --- 主畫面 ---

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">
        <div className="animate-spin mr-2"><Settings size={20}/></div> 正在載入旅程...
      </div>
    );
  }

  // 若未設定資料庫，強制顯示設定頁
  if (!db && !window.__firebase_config) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center justify-center max-w-lg mx-auto">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-100 p-4 rounded-full">
              <Plane size={40} className="text-blue-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center mb-2 text-slate-800">歡迎使用 TravelMate</h1>
          <p className="text-center text-slate-500 mb-6">請設定您的雲端資料庫。</p>
          
          {statusMsg && (
            <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 text-sm
              ${statusMsg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}
            `}>
              {statusMsg.type === 'error' ? <AlertCircle size={18} className="mt-0.5" /> : <CheckCircle size={18} className="mt-0.5" />}
              <div>{statusMsg.text}</div>
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <button onClick={() => setConfigMode('auto')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${configMode === 'auto' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>自動貼上</button>
            <button onClick={() => setConfigMode('manual')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${configMode === 'manual' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>手動輸入</button>
          </div>
          
          <div className="space-y-4">
            {configMode === 'auto' ? (
              <div>
                <label className="block text-sm font-medium mb-1">Firebase Config (貼上整段代碼)</label>
                <textarea 
                  className="w-full h-32 text-xs font-mono bg-slate-100 border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={firebaseConfigStr}
                  onChange={e => setFirebaseConfigStr(e.target.value)}
                  placeholder='const firebaseConfig = { ... }'
                />
              </div>
            ) : (
              <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <Input label="API Key" value={manualConfig.apiKey} onChange={v => setManualConfig({...manualConfig, apiKey: v})} />
                <Input label="Project ID" value={manualConfig.projectId} onChange={v => setManualConfig({...manualConfig, projectId: v})} />
                <Input label="Auth Domain" value={manualConfig.authDomain} onChange={v => setManualConfig({...manualConfig, authDomain: v})} />
                <Input label="App ID" value={manualConfig.appId} onChange={v => setManualConfig({...manualConfig, appId: v})} />
              </div>
            )}
            
            <Button onClick={handleSaveConfig} className="w-full">
              儲存並開始
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-sans text-slate-800">
      {/* 頂部導航 */}
      <div className="bg-blue-600 text-white p-4 sticky top-0 z-40 shadow-md">
        <div className="flex justify-between items-center max-w-md mx-auto">
          <div className="flex items-center gap-2">
            <Plane size={20} />
            <h1 className="font-bold text-lg">TravelMate</h1>
          </div>
          <div className="flex gap-3">
             {/* 公共共享模式：所有人都連線到同一個公共區 */}
             <div className="text-xs bg-emerald-600/90 px-3 py-1 rounded-full flex items-center gap-1 shadow-sm border border-emerald-400/50 font-medium text-white">
               <Users size={12}/> 共享模式
             </div>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-6">

        {/* --- 儀表板 (Dashboard) --- */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4 animate-in fade-in">
            {/* 天氣卡片 */}
            <Card className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white border-none overflow-hidden relative">
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin size={18} />
                    <span className="font-bold text-lg">{cityName}</span>
                  </div>
                  {weatherData && (
                    <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm">
                      <img 
                        src={`https://openweathermap.org/img/wn/${weatherData.weather[0].icon}.png`} 
                        className="w-8 h-8" 
                        alt="weather"
                      />
                    </div>
                  )}
                </div>
                
                {weatherData ? (
                  <>
                    <div className="flex items-end gap-2 mb-2">
                      <h2 className="text-5xl font-bold">{Math.round(weatherData.main.temp)}°</h2>
                      <span className="text-xl mb-1 opacity-90">{weatherData.weather[0].description}</span>
                    </div>
                    <div className="flex gap-4 text-sm opacity-90">
                      <div className="flex items-center gap-1">
                        <Droplets size={14} /> 濕度 {weatherData.main.humidity}%
                      </div>
                      <div className="flex items-center gap-1">
                        <Wind size={14} /> 風速 {weatherData.wind.speed} m/s
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-4">
                    {weatherError ? (
                      <div className="flex items-center gap-2 text-red-100 bg-red-500/20 p-2 rounded">
                        <AlertCircle size={16} />
                        <span className="text-sm">{weatherError}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 opacity-70">
                        <RefreshCw size={16} className="animate-spin" />
                        <span>正在載入天氣資訊...</span>
                      </div>
                    )}
                    {weatherError && <div className="text-xs mt-2 opacity-70">請至設定檢查 API Key 或城市名稱</div>}
                  </div>
                )}
              </div>
              
              {/* 裝飾背景 */}
              <CloudSun size={120} className="absolute -right-6 -bottom-6 text-white/10" />
            </Card>

            {/* 快速統計 */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="flex flex-col items-center justify-center py-6">
                <Calendar className="text-blue-500 mb-2" size={28} />
                <span className="text-2xl font-bold">{itinerary.length}</span>
                <span className="text-xs text-slate-400 uppercase">行程活動</span>
              </Card>
              <Card className="flex flex-col items-center justify-center py-6">
                <Wallet className="text-emerald-500 mb-2" size={28} />
                <span className="text-2xl font-bold">
                  <span className="text-sm align-top">$</span>
                  {Math.round(totalExpenseTWD).toLocaleString()}
                </span>
                <span className="text-xs text-slate-400 uppercase">總支出 (約合 TWD)</span>
              </Card>
            </div>

            {/* 即將到來 */}
            <div>
              <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                <ArrowRight size={18} /> 接下來
              </h3>
              {itinerary.length > 0 ? (
                <div className="space-y-3">
                  {itinerary
                    .filter(item => !item.date || item.date >= new Date().toISOString().split('T')[0])
                    .slice(0, 3)
                    .map(item => (
                    <div 
                      key={item.id} 
                      onClick={() => openEditModal(item, 'itinerary')} 
                      className="bg-white p-3 rounded-xl border border-slate-100 flex items-center gap-3 shadow-sm cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      <div className="bg-blue-50 text-blue-600 p-2 rounded-lg font-bold text-xs flex flex-col items-center w-14">
                        <span>{item.time?.split(':')[0]}:{item.time?.split(':')[1]}</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-sm">{item.title}</h4>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <MapPin size={10} /> {item.location || '未設定地點'}
                        </p>
                      </div>
                    </div>
                  ))}
                  {itinerary.filter(item => !item.date || item.date >= new Date().toISOString().split('T')[0]).length === 0 && (
                     <div className="text-center py-8 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                      接下來沒有行程囉！
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                  尚無行程，快去新增吧！
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- 行程表 (Itinerary) --- */}
        {activeTab === 'itinerary' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">行程規劃</h2>
              <Button onClick={() => openAddModal('itinerary')} className="h-10 w-10 !p-0 rounded-full">
                <Plus size={24} />
              </Button>
            </div>

            {/* 日期標籤頁 (Scrollable Tabs) */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
              {uniqueItineraryDates.map(date => (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-colors whitespace-nowrap
                    ${selectedDate === date 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200' 
                      : 'bg-white text-slate-500 border border-slate-200'}`}
                >
                  {date}
                </button>
              ))}
            </div>

            {/* 當日行程列表 */}
            <div className="space-y-3">
                <div className="flex justify-between items-center">
                   <h3 className="font-bold text-slate-700">
                     {selectedDate || '請選擇日期'}
                   </h3>
                   {/* 當日地圖按鈕 */}
                   {filteredItineraryByDate.length >= 2 && getMapsLinkForDay(filteredItineraryByDate) && (
                      <Button 
                        href={getMapsLinkForDay(filteredItineraryByDate)} 
                        target="_blank"
                        variant="action" 
                        className="!py-1 !px-3 text-xs h-8"
                      >
                        <Navigation size={14} /> 地圖路線
                      </Button>
                   )}
                </div>

                {filteredItineraryByDate.length > 0 ? (
                  <div className="pl-4 border-l-2 border-blue-200 ml-2 space-y-4">
                    {filteredItineraryByDate.map((item) => (
                      <div 
                        key={item.id} 
                        onClick={() => openEditModal(item, 'itinerary')} 
                        className="relative bg-white p-4 rounded-xl shadow-sm border border-slate-100 group cursor-pointer hover:ring-2 hover:ring-blue-100 transition-all"
                      >
                        <div className="absolute -left-[21px] top-6 w-3 h-3 rounded-full border-2 border-slate-50 bg-blue-500"></div>
                        
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono font-bold text-slate-600 text-lg">{item.time}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider
                                ${item.type === 'food' ? 'bg-orange-100 text-orange-600' : 
                                  item.type === 'transport' ? 'bg-purple-100 text-purple-600' :
                                  'bg-blue-100 text-blue-600'}`}>
                                {item.type}
                              </span>
                            </div>
                            <h4 className="font-bold text-slate-800 text-lg">{item.title}</h4>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {item.location && (
                                <p className="text-sm text-slate-500 flex items-center gap-1">
                                  <MapPin size={14} /> {item.location}
                                </p>
                              )}
                              
                              {/* 連結按鈕區域 */}
                              <div className="flex items-center gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                                {item.mapLink && (
                                  <a href={item.mapLink} target="_blank" rel="noopener noreferrer" 
                                    className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline bg-blue-50 px-2 py-0.5 rounded">
                                    <ExternalLink size={12} /> 地圖
                                  </a>
                                )}
                                {item.linkedNoteId && (
                                  <button onClick={(e) => handleShowLinkedNote(item.linkedNoteId, e)}
                                    className="inline-flex items-center gap-1 text-xs text-purple-600 hover:bg-purple-100 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 transition-colors">
                                    <LinkIcon size={12} /> 票券
                                  </button>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); checkItemWeather(item.weatherCity, item.title); }}
                                    className="inline-flex items-center gap-1 text-xs text-orange-600 hover:bg-orange-100 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 transition-colors">
                                    <CloudSun size={12} /> 天氣
                                </button>
                              </div>
                            </div>
                          </div>
                          <button onClick={(e) => handleDelete('itinerary', item.id, e)} className="text-slate-300 hover:text-red-500 p-2">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                    <Calendar size={48} className="mx-auto mb-4 opacity-20" />
                    <p>當日無行程，點擊右上角新增！</p>
                  </div>
                )}
            </div>
          </div>
        )}

        {/* --- 記帳 (Budget) --- */}
        {activeTab === 'budget' && budgetView === 'list' && (
          <div className="space-y-4 animate-in fade-in">
             <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">支出記帳</h2>
              <div className="flex gap-2">
                <Button variant="secondary" className="h-10 !px-3 text-sm" onClick={() => setBudgetView('settlement')}>
                  <PieChart size={18} className="mr-1" /> 結算
                </Button>
                <Button onClick={() => openAddModal('expense')} className="h-10 w-10 !p-0 rounded-full">
                  <Plus size={24} />
                </Button>
              </div>
            </div>

            <Card className="bg-slate-800 text-white">
              <p className="text-slate-400 text-sm">總花費 (估計台幣)</p>
              <h3 className="text-4xl font-bold mt-1">${Math.round(totalExpenseTWD).toLocaleString()}</h3>
              <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                 {Object.entries(expensesByCategory).map(([cat, amount]) => (
                   <div key={cat} className="flex-shrink-0 bg-slate-700 px-3 py-1 rounded-lg text-xs">
                     <span className="opacity-70 mr-1">{cat}:</span>
                     <span className="font-bold">${Math.round(amount).toLocaleString()}</span>
                   </div>
                 ))}
              </div>
            </Card>

            <div className="space-y-2">
              {expenses.map(item => (
                <div 
                  key={item.id} 
                  onClick={() => openEditModal(item, 'expense')}
                  className="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center cursor-pointer hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-50 text-emerald-600 p-2 rounded-lg">
                      {item.category === 'food' ? <Coffee size={18} /> : 
                       item.category === 'transport' ? <Train size={18} /> : <DollarSign size={18} />}
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">{item.title}</h4>
                      <p className="text-xs text-slate-400 flex items-center gap-2">
                        {item.date}
                        <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-bold">
                          {item.payer || '我'}付
                        </span>
                        {item.splitCount > 1 && (
                           <span className="bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5">
                             <Users size={8} /> {item.splitCount}人
                           </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-slate-800 block">
                      {item.currency} {item.amount.toLocaleString()}
                    </span>
                    {item.currency !== 'TWD' && exchangeRate && (
                       <span className="text-[10px] text-slate-400 block">
                         ≈ {Math.round(calculateTwdAmount(item.amount, item.currency)).toLocaleString()}
                       </span>
                    )}
                    <button onClick={(e) => handleDelete('expenses', item.id, e)} className="text-xs text-red-300 hover:text-red-500 mt-1">刪除</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- 記帳 (Settlement) --- */}
        {activeTab === 'budget' && budgetView === 'settlement' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setBudgetView('list')} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200">
                <ArrowLeftRight size={20} />
              </button>
              <h2 className="text-xl font-bold">分帳結算</h2>
            </div>

            <Card className="bg-indigo-600 text-white">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-indigo-200 text-xs">總旅費 (TWD)</p>
                  <h3 className="text-3xl font-bold">${Math.round(totalExpenseTWD).toLocaleString()}</h3>
                </div>
                <div className="text-right">
                  <p className="text-indigo-200 text-xs">平均每人</p>
                  <h3 className="text-2xl font-bold">${Math.round(settlementData.average).toLocaleString()}</h3>
                </div>
              </div>
            </Card>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-700">分攤人數設定</h3>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    min="1"
                    value={settlementPeopleCount || settlementData.uniquePayers.length}
                    onChange={(e) => setSettlementPeopleCount(parseInt(e.target.value) || 0)}
                    className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-center text-sm"
                  />
                  <span className="text-sm text-slate-500">人</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                * 系統自動抓取付款人：{settlementData.uniquePayers.join(', ') || '無'}
              </p>

              <div className="space-y-3">
                {settlementData.uniquePayers.map(payer => {
                  const paid = settlementData.payers[payer];
                  const diff = paid - settlementData.average;
                  return (
                    <div key={payer} className="flex justify-between items-center border-b border-slate-50 pb-2 last:border-0">
                      <div>
                        <span className="font-bold text-slate-800">{payer}</span>
                        <span className="text-xs text-slate-400 block">已付 ${Math.round(paid).toLocaleString()}</span>
                      </div>
                      <div className={`text-right font-bold ${diff >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {diff >= 0 ? '應收' : '應付'} ${Math.abs(Math.round(diff)).toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="text-center text-xs text-slate-400">
              * 計算以台幣為基準，匯率採即時匯率估算。
            </div>
          </div>
        )}

        {/* --- 筆記與清單 (Docs & Checklists) --- */}
        {activeTab === 'docs' && (
          <div className="space-y-6 animate-in fade-in">
             {/* 分頁切換 (Checklist vs Notes) */}
             <div className="flex justify-between items-center mb-4">
               <h2 className="text-xl font-bold">清單與票券</h2>
               <div className="flex gap-2">
                 <Button onClick={() => handleAddChecklist()} className="h-9 px-3 text-xs bg-emerald-600 hover:bg-emerald-700">
                   <Plus size={16} className="mr-1"/> 新清單
                 </Button>
                 <Button onClick={() => openAddModal('note')} className="h-9 w-9 !p-0 rounded-full">
                   <Plus size={20} />
                 </Button>
               </div>
             </div>

             {/* 必帶清單區塊 */}
             {checklists.length > 0 ? (
               <div className="space-y-4">
                 {checklists.map(list => (
                   <Card key={list.id} className="relative group">
                     <div className="flex justify-between items-center mb-3">
                       <h3 className="font-bold text-slate-700 flex items-center gap-2">
                         <CheckSquare size={18} className="text-emerald-500"/>
                         {list.category}
                       </h3>
                       <button onClick={() => handleDeleteChecklist(list.id)} className="text-slate-300 hover:text-red-500">
                         <Trash2 size={16} />
                       </button>
                     </div>
                     
                     {/* 清單項目 */}
                     <div className="space-y-2 mb-3">
                       {list.items && list.items.map(item => (
                         <div key={item.id} className="flex items-center gap-2">
                           <input 
                             type="checkbox" 
                             checked={item.checked}
                             onChange={() => handleToggleCheckItem(list.id, item.id, item.checked)}
                             className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                           />
                           <span className={`text-sm ${item.checked ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                             {item.name}
                           </span>
                         </div>
                       ))}
                     </div>
                     
                     {/* 新增項目輸入框 */}
                     <input 
                       type="text" 
                       placeholder="+ 新增項目 (按 Enter)" 
                       className="w-full text-sm bg-slate-50 border-none rounded px-2 py-1 focus:ring-1 focus:ring-emerald-500"
                       onKeyDown={(e) => handleAddCheckItem(list.id, e)}
                     />
                   </Card>
                 ))}
               </div>
             ) : (
               <div className="text-center py-4 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                 <CheckSquare size={32} className="mx-auto mb-2 opacity-20" />
                 <p className="text-xs">點擊「新清單」建立行李檢查表</p>
               </div>
             )}

             <hr className="border-slate-200 my-4"/>

             {/* 票券筆記區塊 */}
             <h3 className="font-bold text-slate-500 text-sm uppercase tracking-wider mb-2">票券與筆記</h3>
             <div className="grid grid-cols-1 gap-4">
              {notes.map(note => (
                <Card key={note.id} className="relative group">
                  <div className="flex items-start gap-3">
                    <Ticket className="text-purple-500 shrink-0 mt-1" size={20} />
                    <div className="flex-1 overflow-hidden" onClick={() => openEditModal(note, 'note')}>
                      <h3 className="font-bold text-lg mb-1 cursor-pointer hover:text-blue-600">{note.title}</h3>
                      <p className="text-sm text-slate-600 whitespace-pre-wrap cursor-pointer">{note.content}</p>
                      {note.link && (
                        <a href={note.link} target="_blank" className="mt-3 inline-flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors max-w-full truncate">
                          <ExternalLink size={14} /> 查看附件/連結
                        </a>
                      )}
                    </div>
                    <button onClick={(e) => handleDelete('notes', note.id, e)} className="text-slate-300 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </Card>
              ))}
               {notes.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <BookOpen size={32} className="mx-auto mb-2 opacity-20" />
                  <p>這裡可以存放訂位代號、機票截圖連結或旅遊日記</p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* --- 設定 (Settings) --- */}
        {activeTab === 'settings' && (
          <div className="space-y-6 animate-in fade-in">
            <h2 className="text-xl font-bold">App 設定</h2>
            
            <Card>
              <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-700">
                <Cloud size={18} /> 連線設定
              </h3>

               {/* 狀態訊息顯示區 */}
              {statusMsg && (
                <div className={`mb-4 p-3 rounded-lg flex items-start gap-3 text-sm
                  ${statusMsg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}
                `}>
                  {statusMsg.type === 'error' ? <AlertCircle size={18} className="mt-0.5 shrink-0" /> : <CheckCircle size={18} className="mt-0.5 shrink-0" />}
                  <div>{statusMsg.text}</div>
                </div>
              )}

              <div className="space-y-4">
                <Input label="預設城市 (天氣用)" value={cityName} onChange={setCityName} placeholder="例如: Tokyo" />
                
                {/* 貨幣選擇 */}
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">目標貨幣</label>
                  <select 
                    value={currencyCode} 
                    onChange={(e) => setCurrencyCode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  >
                    <option value="TWD">TWD (新台幣)</option>
                    <option value="JPY">JPY (日圓)</option>
                    <option value="KRW">KRW (韓元)</option>
                    <option value="USD">USD (美金)</option>
                    <option value="EUR">EUR (歐元)</option>
                    <option value="CNY">CNY (人民幣)</option>
                    <option value="THB">THB (泰銖)</option>
                  </select>
                </div>

                <Input label="OpenWeather API Key" type="password" value={weatherApiKey} onChange={setWeatherApiKey} />
                
                {/* 用戶 ID 顯示，方便除錯 */}
                <div className="bg-slate-100 p-3 rounded text-xs text-slate-500 break-all">
                  <span className="font-bold">DEBUG - User ID:</span> {user?.uid || 'Not Signed In'}
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Firebase Config</label>
                    <div className="flex gap-2 text-[10px]">
                      <button onClick={() => setConfigMode('auto')} className={`px-2 py-1 rounded ${configMode === 'auto' ? 'bg-blue-100 text-blue-600 font-bold' : 'text-slate-400'}`}>自動</button>
                      <button onClick={() => setConfigMode('manual')} className={`px-2 py-1 rounded ${configMode === 'manual' ? 'bg-blue-100 text-blue-600 font-bold' : 'text-slate-400'}`}>手動</button>
                    </div>
                  </div>

                  {configMode === 'auto' ? (
                     <>
                      <textarea 
                        className="w-full h-24 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={firebaseConfigStr}
                        onChange={e => setFirebaseConfigStr(e.target.value)}
                        placeholder='請貼上整段 const firebaseConfig = { ... }'
                      />
                      <p className="text-xs text-slate-400 mt-1">請直接貼上整段程式碼。</p>
                     </>
                  ) : (
                    <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                       <Input label="API Key" value={manualConfig.apiKey} onChange={v => setManualConfig({...manualConfig, apiKey: v})} />
                       <Input label="Project ID" value={manualConfig.projectId} onChange={v => setManualConfig({...manualConfig, projectId: v})} />
                       <Input label="Auth Domain" value={manualConfig.authDomain} onChange={v => setManualConfig({...manualConfig, authDomain: v})} />
                       <Input label="App ID" value={manualConfig.appId} onChange={v => setManualConfig({...manualConfig, appId: v})} />
                    </div>
                  )}
                </div>
                
                <Button onClick={handleSaveConfig} className="w-full mt-4">
                  儲存設定
                </Button>
              </div>
            </Card>

            <div className="text-center text-xs text-slate-400 mt-8">
              TravelMate v6.2 • 資料儲存於您個人的 Firebase
            </div>
          </div>
        )}

      </div>

      {/* 底部導航欄 */}
      <div className="fixed bottom-0 w-full bg-white border-t border-slate-200 p-2 pb-safe z-50">
        <div className="max-w-md mx-auto grid grid-cols-5 gap-1">
          <NavBtn icon={<Calendar size={20} />} label="行程" active={activeTab === 'itinerary'} onClick={() => setActiveTab('itinerary')} />
          <NavBtn icon={<DollarSign size={20} />} label="記帳" active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} />
          <NavBtn icon={<MapPin size={24} />} label="首頁" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} main />
          <NavBtn icon={<Ticket size={20} />} label="票券" active={activeTab === 'docs'} onClick={() => setActiveTab('docs')} />
          <NavBtn icon={<Settings size={20} />} label="設定" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>
      </div>

      {/* 彈出視窗 */}
      {renderModal()}
      {renderPreviewNoteModal()}
      {renderWeatherModal()}
    </div>
  );
}

const NavBtn = ({ icon, label, active, onClick, main }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center py-2 rounded-xl transition-all
      ${main ? '-mt-6 bg-blue-600 text-white shadow-lg shadow-blue-200 h-14 w-14 mx-auto' : ''}
      ${active && !main ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:bg-slate-50'}
    `}
  >
    {icon}
    {!main && <span className="text-[10px] font-medium mt-1">{label}</span>}
  </button>
);