import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users, CalendarHeart, Gift, Search, Plus, Edit2,
  Trash2, X, MessageCircle, Settings, LayoutDashboard, Upload,
  Loader, History
} from 'lucide-react';
import * as XLSX from 'xlsx';

// Helper to format date
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Parse month (0-indexed) and day from a date string, avoiding timezone issues
const parseMonthDay = (dateStr) => {
  if (!dateStr) return null;
  // Handle YYYY-MM-DD format directly to avoid UTC vs local timezone mismatch
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return { month: parseInt(isoMatch[2], 10) - 1, day: parseInt(isoMatch[3], 10) };
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  return { month: date.getMonth(), day: date.getDate() };
};

// Helper to check if event is upcoming
const getUpcomingStatus = (dateStr) => {
  const parsed = parseMonthDay(dateStr);
  if (!parsed) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const eventThisYear = new Date(today.getFullYear(), parsed.month, parsed.day);
  if (eventThisYear < today) {
    eventThisYear.setFullYear(today.getFullYear() + 1);
  }

  const diffTime = eventThisYear - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return { status: 'today', days: 0 };
  return { status: 'upcoming', days: diffDays };
};

// Helper to check if event occurred recently (within last N days)
const getPastStatus = (dateStr, daysBack = 7) => {
  const parsed = parseMonthDay(dateStr);
  if (!parsed) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let eventThisYear = new Date(today.getFullYear(), parsed.month, parsed.day);

  // If event is today or in the future, check last year's occurrence
  if (eventThisYear >= today) {
    eventThisYear.setFullYear(today.getFullYear() - 1);
  }

  const diffTime = today - eventThisYear;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 0 && diffDays <= daysBack) {
    return { status: 'past', days: diffDays };
  }
  return null;
};

export default function App() {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  const [devotees, setDevotees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [templeId, setTempleId] = useState(() => localStorage.getItem('iskcon_temple_id') || '');
  const [loginInput, setLoginInput] = useState('');
  
  const [templeName, setTempleName] = useState(() => {
    return localStorage.getItem('iskcon_temple_name') || 'ISKCON Temple';
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [search, setSearch] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    dob: '',
    anniversary: ''
  });

  // Fetch from Backend
  useEffect(() => {
    if (!templeId) return;
    setLoading(true);
    fetch(`${API_URL}/devotees?templeId=${encodeURIComponent(templeId)}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setDevotees(data);
      })
      .catch(err => console.error("Error fetching from backend:", err))
      .finally(() => setLoading(false));
  }, [API_URL, templeId]);

  const fileInputRef = useRef(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        
        // Find the headers from the first row to ensure we always have the right keys
        if (data.length === 0) return;
        const allKeys = Object.keys(data[0]);
        const nameKey = allKeys.find(k => k.toLowerCase().includes('name')) || allKeys[1]; // fallback to 2nd column
        const contactKey = allKeys.find(k => k.toLowerCase().includes('contact') || k.toLowerCase().includes('phone') || k.toLowerCase().includes('no')) || allKeys[3];
        const dobKey = allKeys.find(k => k.toLowerCase().includes('birth') || k.toLowerCase().includes('dob')) || allKeys[2];
        const annivKey = allKeys.find(k => k.toLowerCase().includes('anniv'));
        
        const newDevotees = data.map((row, index) => {
          let dobVal = row[dobKey];
          let annivVal = annivKey ? row[annivKey] : '';
          
          const parseExcelDate = (val) => {
            if (!val) return '';
            try {
              if (!isNaN(val) && typeof val === 'number') {
                 const d = new Date(Math.round((val - 25569) * 86400 * 1000));
                 if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
                 return '';
              }
              const str = String(val).trim();
              const parts = str.split(/[-/]/);
              if (parts.length === 2) {
                  const p1 = parseInt(parts[0], 10);
                  const p2 = parseInt(parts[1], 10);
                  let m, d;
                  if (p1 > 12) { d = p1; m = p2; } else { m = p1; d = p2; }
                  return `2000-${String(m || 1).padStart(2, '0')}-${String(d || 1).padStart(2, '0')}`;
              } else if (parts.length === 3) {
                  // simple attempt to parse generic string
                  const d = new Date(str);
                  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
                  
                  // if invalid, assume D/M/Y or M/D/Y
                  let p1 = parseInt(parts[0], 10);
                  let p2 = parseInt(parts[1], 10);
                  let p3 = parseInt(parts[2], 10);
                  // standardizing to yyyy-mm-dd
                  if (p3 < 100) p3 += 2000;
                  let m, d_val;
                  if (p1 > 12) { d_val = p1; m = p2; } else { m = p1; d_val = p2; } // guess
                  const safeYear = p3 || 2000;
                  const safeMonth = String(m || 1).padStart(2, '0');
                  const safeDay = String(d_val || 1).padStart(2, '0');
                  return `${safeYear}-${safeMonth}-${safeDay}`;
              }
            } catch (e) {
              console.error("Date parsing error for val:", val, e);
            }
            return '';
          };
          
          return {
            id: Date.now().toString() + '-' + index,
            name: (nameKey && row[nameKey]) ? String(row[nameKey]).trim() : `Unknown Devotee ${index}`,
            contact: (contactKey && row[contactKey]) ? String(row[contactKey]).trim() : '',
            dob: parseExcelDate(dobVal),
            anniversary: parseExcelDate(annivVal)
          };
        });
        
        fetch(`${API_URL}/devotees/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ devotees: newDevotees, templeId })
        }).then(res => {
          if (!res.ok) throw new Error("Backend error");
          setDevotees(prev => {
            const existing = new Set(prev.map(d => (d.name || '') + (d.contact || '')));
            const filteredNew = newDevotees.filter(d => !existing.has((d.name || '') + (d.contact || '')) && (d.name || d.contact));
            return [...prev, ...filteredNew];
          });
          alert(`Successfully imported devotees!`);
        }).catch(err => {
          console.error(err);
          alert("Failed to save to backend database. Please check your Render logs.");
        });
      } catch (err) {
        console.error(err);
        alert('Error parsing Excel file: ' + err.message);
      }
      e.target.value = null;
    };
    reader.readAsBinaryString(file);
  };

  useEffect(() => {
    localStorage.setItem('iskcon_temple_name', templeName);
  }, [templeName]);

  const handleOpenModal = (devotee = null) => {
    if (devotee) {
      setFormData(devotee);
      setEditingId(devotee.id);
    } else {
      setFormData({ name: '', contact: '', dob: '', anniversary: '' });
      setEditingId(null);
    }
    setIsModalOpen(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    const isEdit = !!editingId;
    const newDevotee = isEdit ? { ...formData, id: editingId, templeId } : { ...formData, id: Date.now().toString(), templeId };
    
    fetch(`${API_URL}/devotees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDevotee)
    }).then(res => {
      if (!res.ok) throw new Error("Backend error");
      if (isEdit) {
        setDevotees(devotees.map(d => d.id === editingId ? newDevotee : d));
      } else {
        setDevotees([...devotees, newDevotee]);
      }
      setIsModalOpen(false);
    }).catch(err => alert("Failed to save to database."));
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this devotee?')) {
      fetch(`${API_URL}/devotees/${id}?templeId=${encodeURIComponent(templeId)}`, { method: 'DELETE' })
        .then(res => {
          if (!res.ok) throw new Error("Backend error");
          setDevotees(devotees.filter(d => d.id !== id));
        })
        .catch(err => alert("Failed to delete from database."));
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (loginInput.trim()) {
      setTempleId(loginInput.trim().toLowerCase());
      localStorage.setItem('iskcon_temple_id', loginInput.trim().toLowerCase());
    }
  };

  const handleLogout = () => {
    setTempleId('');
    setDevotees([]);
    localStorage.removeItem('iskcon_temple_id');
  };

  const filteredDevotees = useMemo(() => {
    return devotees.filter(d => {
      const nameMatch = d.name ? d.name.toLowerCase().includes(search.toLowerCase()) : false;
      const contactMatch = d.contact ? d.contact.includes(search) : false;
      return nameMatch || contactMatch;
    });
  }, [devotees, search]);

  const upcomingBirthdays = useMemo(() => {
    return devotees
      .map(d => ({ ...d, status: getUpcomingStatus(d.dob) }))
      .filter(d => d.status)
      .sort((a, b) => a.status.days - b.status.days);
  }, [devotees]);

  const upcomingAnniversaries = useMemo(() => {
    return devotees
      .map(d => ({ ...d, status: getUpcomingStatus(d.anniversary) }))
      .filter(d => d.status)
      .sort((a, b) => a.status.days - b.status.days);
  }, [devotees]);

  const pastBirthdays = useMemo(() => {
    return devotees
      .map(d => ({ ...d, pastStatus: getPastStatus(d.dob) }))
      .filter(d => d.pastStatus)
      .sort((a, b) => a.pastStatus.days - b.pastStatus.days);
  }, [devotees]);

  const pastAnniversaries = useMemo(() => {
    return devotees
      .map(d => ({ ...d, pastStatus: getPastStatus(d.anniversary) }))
      .filter(d => d.pastStatus)
      .sort((a, b) => a.pastStatus.days - b.pastStatus.days);
  }, [devotees]);

  if (!templeId) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '40px' }}>
          <Gift size={48} color="var(--primary)" style={{ margin: '0 auto 16px' }} />
          <h2 className="mb-6">ISKCON Reminders</h2>
          <p className="mb-6" style={{ color: 'var(--text-muted)' }}>Enter your unique Temple ID to access your dashboard.</p>
          <form onSubmit={handleLogin}>
            <input 
              type="text" 
              className="form-control mb-4" 
              placeholder="e.g. iskcon-mumbai" 
              value={loginInput}
              onChange={e => setLoginInput(e.target.value)}
              required
            />
            <button className="btn btn-primary" style={{ width: '100%' }} type="submit">Access Dashboard</button>
          </form>
        </div>
      </div>
    );
  }

  const sendWhatsApp = (contact, type, name) => {
    // Remove non-numeric chars
    let phone = contact.replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone; // Add India code if 10 digits
    
    const message = type === 'birthday' 
      ? `Hare Krishna ${name} prabhu/mataji! 🙏\n\nWishing you a very happy Krishna Conscious Birthday on behalf of ${templeName}. May Lord Krishna and Srila Prabhupada shower their choicest blessings upon you.`
      : `Hare Krishna ${name}! 🙏\n\nWishing you a very happy Krishna Conscious Anniversary on behalf of ${templeName}. May Lord Krishna bless your family.`;
      
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };



  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Gift size={28} />
          <div>
            <div style={{ fontSize: '1.2rem' }}>ISKCON</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Reminders</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={20} /> Dashboard
          </button>
          <button 
            className={`nav-item ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
          >
            <Users size={20} /> Devotees List
          </button>
          <button 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={20} /> Settings
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="topbar">
          <div className="page-title">{templeName}</div>
          <div className="flex gap-3">
            <input 
              type="file" 
              accept=".xlsx, .xls, .csv" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileUpload} 
            />
            <button className="btn" style={{ background: '#f8fafc', border: '1px solid var(--border)' }} onClick={() => fileInputRef.current?.click()}>
              <Upload size={18} /> Import Excel
            </button>
            <button className="btn btn-primary" onClick={() => handleOpenModal()}>
              <Plus size={18} /> Add Devotee
            </button>
          </div>
        </header>

        <div className="content-area">
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div>
              {loading ? (
                <div className="loading-state">
                  <Loader size={40} className="spinner" />
                  <p>Loading devotees...</p>
                </div>
              ) : (
              <>
              <div className="stats-grid">
                <div className="stat-card stat-card-primary">
                  <Users className="icon" size={100} />
                  <div className="stat-title">Total Devotees</div>
                  <div className="stat-value">{devotees.length}</div>
                </div>
                <div className="stat-card stat-card-accent">
                  <Gift className="icon" size={100} />
                  <div className="stat-title">Upcoming Birthdays</div>
                  <div className="stat-value">{upcomingBirthdays.length}</div>
                </div>
                <div className="stat-card stat-card-success">
                  <CalendarHeart className="icon" size={100} />
                  <div className="stat-title">Upcoming Anniversaries</div>
                  <div className="stat-value">{upcomingAnniversaries.length}</div>
                </div>
              </div>

              <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
                <div className="card" style={{ flex: '1 1 400px' }}>
                  <h3 className="mb-4 flex items-center gap-2" style={{ color: 'var(--primary)' }}>
                    <Gift size={20} /> Upcoming Birthdays
                  </h3>
                  {upcomingBirthdays.length === 0 ? (
                    <div className="empty-state" style={{ padding: '32px 0' }}>
                      <p>No birthdays found.</p>
                    </div>
                  ) : (
                    <div className="table-container" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                      <table>
                        <tbody>
                          {upcomingBirthdays.map(d => (
                            <tr key={d.id}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{d.name}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(d.dob)}</div>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {d.status.days === 0 ? (
                                  <span className="badge badge-today mb-2 flex justify-center">Today!</span>
                                ) : (
                                  <span className="badge badge-upcoming mb-2 flex justify-center">In {d.status.days} days</span>
                                )}
                                <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => sendWhatsApp(d.contact, 'birthday', d.name)}>
                                  <MessageCircle size={14} /> Send Wish
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="card" style={{ flex: '1 1 400px' }}>
                  <h3 className="mb-4 flex items-center gap-2" style={{ color: 'var(--success)' }}>
                    <CalendarHeart size={20} /> Upcoming Anniversaries
                  </h3>
                  {upcomingAnniversaries.length === 0 ? (
                    <div className="empty-state" style={{ padding: '32px 0' }}>
                      <p>No anniversaries found.</p>
                    </div>
                  ) : (
                    <div className="table-container" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                      <table>
                        <tbody>
                          {upcomingAnniversaries.map(d => (
                            <tr key={d.id}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{d.name}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(d.anniversary)}</div>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {d.status.days === 0 ? (
                                  <span className="badge badge-today mb-2 flex justify-center">Today!</span>
                                ) : (
                                  <span className="badge badge-upcoming mb-2 flex justify-center">In {d.status.days} days</span>
                                )}
                                <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: 'var(--success)' }} onClick={() => sendWhatsApp(d.contact, 'anniversary', d.name)}>
                                  <MessageCircle size={14} /> Send Wish
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Past / Missed Events */}
              {(pastBirthdays.length > 0 || pastAnniversaries.length > 0) && (
                <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
                  {pastBirthdays.length > 0 && (
                    <div className="card" style={{ flex: '1 1 400px' }}>
                      <h3 className="mb-4 flex items-center gap-2" style={{ color: 'var(--danger)' }}>
                        <History size={20} /> Recent Birthdays (Last 7 days)
                      </h3>
                      <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        <table>
                          <tbody>
                            {pastBirthdays.map(d => (
                              <tr key={d.id}>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{d.name}</div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(d.dob)}</div>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <span className="badge badge-past mb-2 flex justify-center">
                                    {d.pastStatus.days === 1 ? 'Yesterday' : `${d.pastStatus.days} days ago`}
                                  </span>
                                  <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: 'var(--danger)' }} onClick={() => sendWhatsApp(d.contact, 'birthday', d.name)}>
                                    <MessageCircle size={14} /> Send Belated Wish
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {pastAnniversaries.length > 0 && (
                    <div className="card" style={{ flex: '1 1 400px' }}>
                      <h3 className="mb-4 flex items-center gap-2" style={{ color: 'var(--danger)' }}>
                        <History size={20} /> Recent Anniversaries (Last 7 days)
                      </h3>
                      <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        <table>
                          <tbody>
                            {pastAnniversaries.map(d => (
                              <tr key={d.id}>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{d.name}</div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(d.anniversary)}</div>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <span className="badge badge-past mb-2 flex justify-center">
                                    {d.pastStatus.days === 1 ? 'Yesterday' : `${d.pastStatus.days} days ago`}
                                  </span>
                                  <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: 'var(--danger)' }} onClick={() => sendWhatsApp(d.contact, 'anniversary', d.name)}>
                                    <MessageCircle size={14} /> Send Belated Wish
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
              </>
              )}
            </div>
          )}

          {/* Devotees List Tab */}
          {activeTab === 'list' && (
            <div className="card">
              {loading ? (
                <div className="loading-state">
                  <Loader size={40} className="spinner" />
                  <p>Loading devotees...</p>
                </div>
              ) : (
              <>
              <div className="flex justify-between items-center mb-6">
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>All Devotees</h2>
                <div className="flex items-center gap-2" style={{ position: 'relative', width: '300px' }}>
                  <Search size={18} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Search name or contact..." 
                    style={{ paddingLeft: '36px' }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              {filteredDevotees.length === 0 ? (
                <div className="empty-state">
                  <Users size={48} />
                  <h3>No Devotees Found</h3>
                  <p>Add some devotees to start tracking their special days.</p>
                  <button className="btn btn-primary mt-4" onClick={() => handleOpenModal()}>
                    <Plus size={18} /> Add Devotee
                  </button>
                </div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Contact No</th>
                        <th>Date of Birth</th>
                        <th>Anniversary</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDevotees.map(d => (
                        <tr key={d.id}>
                          <td style={{ fontWeight: 500 }}>{d.name}</td>
                          <td>{d.contact}</td>
                          <td>{formatDate(d.dob) || '-'}</td>
                          <td>{formatDate(d.anniversary) || '-'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="flex justify-end gap-2">
                              <button className="btn-icon" onClick={() => handleOpenModal(d)} title="Edit">
                                <Edit2 size={18} />
                              </button>
                              <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(d.id)} title="Delete">
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              </>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="card" style={{ maxWidth: '600px' }}>
              <div className="flex justify-between items-center mb-6">
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Application Settings</h2>
              </div>
              
              <div className="form-group mb-6">
                <label className="form-label">Current Temple ID</label>
                <div className="flex gap-2 items-center">
                  <input 
                    type="text" 
                    className="form-control" 
                    value={templeId}
                    readOnly
                    style={{ background: '#f1f5f9', color: 'var(--text-muted)' }}
                  />
                  <button className="btn btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={handleLogout}>
                    Change / Switch
                  </button>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  This is your unique database identifier. Changing this will switch to a different temple's dashboard.
                </p>
              </div>

              <div className="form-group mb-6">
                <label className="form-label">Temple/Organization Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={templeName}
                  onChange={(e) => setTempleName(e.target.value)}
                  placeholder="e.g. ISKCON Mumbai"
                />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  This name will be used in the WhatsApp message templates.
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">WhatsApp Integration Note</label>
                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.9rem' }}>
                  <p className="mb-2"><strong>How notifications work:</strong></p>
                  <p className="mb-2">Currently, clicking "Send Wish" opens WhatsApp Web or the app with a pre-filled message, allowing you to easily send wishes manually.</p>
                  <p><strong>Want fully automated messages?</strong> This requires integrating with a WhatsApp Business API provider (like Meta, Twilio, or UltraMsg) and a backend server to run daily scheduled jobs. Since this is a browser-only app, it handles the logic and UI perfectly while relying on manual clicks for the final sending.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <form onSubmit={handleSave}>
              <div className="modal-header">
                <h3 className="modal-title">{editingId ? 'Edit Devotee' : 'Add New Devotee'}</h3>
                <button type="button" className="btn-icon" onClick={() => setIsModalOpen(false)}>
                  <X size={20} />
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    required 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g. Mukesh Patel"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Contact No *</label>
                  <input 
                    type="tel" 
                    className="form-control" 
                    required 
                    value={formData.contact}
                    onChange={e => setFormData({...formData, contact: e.target.value})}
                    placeholder="e.g. 9753336648"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Date of Birth</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={formData.dob}
                    onChange={e => setFormData({...formData, dob: e.target.value})}
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">Anniversary</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={formData.anniversary}
                    onChange={e => setFormData({...formData, anniversary: e.target.value})}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" style={{ background: '#e2e8f0' }} onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingId ? 'Update' : 'Save'} Devotee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
