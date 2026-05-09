import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  Settings2, 
  Play, 
  Layers, 
  Target,
  X,
  Loader2,
  Terminal,
  UploadCloud,
  FileSpreadsheet,
  Moon,
  Sun
} from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const OPERATORS = [
  { label: '=', value: '=' },
  { label: '>=', value: '>=' },
  { label: '<=', value: '<=' },
  { label: '≈', value: '≈' },
];

export default function App() {
  const [datasets, setDatasets] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [schema, setSchema] = useState({});
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [isDark, setIsDark] = useState(true); // Default to dark mode
  const [previewData, setPreviewData] = useState(null);
  
  const [totalCount, setTotalCount] = useState(500);
  const [priorities, setPriorities] = useState(["难度", "类目", "应用场景", "二级维度", "挑战点", "参数要求"]);
  const [conditions, setConditions] = useState([]);
  
  const [expandedSections, setExpandedSections] = useState({
    "难度": true,
    "应用场景": true,
    "类目": true,
    "二级维度": true,
    "挑战点": true,
    "参数要求": true
  });
  const [searchTerms, setSearchTerms] = useState({});

  const fileInputRef = useRef(null);

  const fetchDatasets = () => {
    fetch('http://localhost:8000/api/datasets')
      .then(res => res.json())
      .then(data => {
        if (data.datasets && data.datasets.length > 0) {
          setDatasets(data.datasets);
          if (!selectedFile) setSelectedFile(data.datasets[0]);
        }
      })
      .catch(err => console.error("Error fetching datasets:", err));
  };

  useEffect(() => {
    fetchDatasets();
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    if (!selectedFile) return;
    
    setLoading(true);
    setConditions([]);
    
    fetch(`http://localhost:8000/api/schema?file_name=${encodeURIComponent(selectedFile)}`)
      .then(res => res.json())
      .then(data => {
        setSchema(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching schema:", err);
        setLoading(false);
      });
  }, [selectedFile]);

  const handleFileUpload = async (file) => {
    if (!file || !file.name.endsWith('.xlsx')) {
      alert('请上传 .xlsx 格式的 Excel 文件！');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        await fetchDatasets();
        setSelectedFile(result.filename); // Automatically switch to the uploaded file
      } else {
        alert('文件上传失败，请重试');
      }
    } catch (error) {
      console.error('Upload Error:', error);
      alert('网络错误，上传失败');
    } finally {
      setUploading(false);
      setDragActive(false);
    }
  };

  const handleDrag = function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = function(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChange = function(e) {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleGenerate = async (mode) => {
    if (!selectedFile) {
      alert("请先选择数据源！");
      return;
    }
    
    setLoading(true);
    
    const payload = {
      file_name: selectedFile,
      total_target_count: totalCount,
      priorities: priorities,
      conditions: conditions,
      mode: mode
    };

    try {
      const res = await fetch('http://localhost:8000/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const result = await res.json();
        setPreviewData(result);
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`生成失败: ${errorData.detail || res.statusText}`);
      }
    } catch (err) {
      console.error(err);
      alert('生成请求出错，请检查网络或后端状态。');
    } finally {
      setLoading(false);
    }
  };

  const downloadPreview = (mode) => {
    if (!previewData) return;
    const url = `http://localhost:8000/api/download/${previewData.preview_id}?mode=${mode}`;
    const a = document.createElement('a');
    a.href = url;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // setPreviewData(null); // Keep the modal open in case they want both files
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const movePriority = (index, direction) => {
    if (index === 0 && direction === -1) return;
    if (index === priorities.length - 1 && direction === 1) return;
    
    const newPriorities = [...priorities];
    const temp = newPriorities[index];
    newPriorities[index] = newPriorities[index + direction];
    newPriorities[index + direction] = temp;
    setPriorities(newPriorities);
  };

  const toggleCondition = (dimension, value) => {
    const existingIdx = conditions.findIndex(c => c.dimension === dimension && c.value === value);
    if (existingIdx >= 0) {
      const newCond = [...conditions];
      newCond.splice(existingIdx, 1);
      setConditions(newCond);
    } else {
      setConditions([...conditions, { dimension, value, operator: '≈', target: 20 }]);
    }
  };

  const updateCondition = (dimension, value, field, val) => {
    const existingIdx = conditions.findIndex(c => c.dimension === dimension && c.value === value);
    if (existingIdx >= 0) {
      const newCond = [...conditions];
      newCond[existingIdx][field] = val;
      setConditions(newCond);
    }
  };

  const renderSection = (dimension) => {
    const items = schema[dimension] || [];
    if (items.length === 0) return null;
    
    const searchTerm = searchTerms[dimension] || '';
    const filteredItems = items.filter(item => item.toLowerCase().includes(searchTerm.toLowerCase()));
    const isExpanded = expandedSections[dimension];
    
    const activeCount = conditions.filter(c => c.dimension === dimension).length;

    return (
      <div key={dimension} className="mb-6 bg-surface border border-borderSubtle rounded-lg shadow-xl shadow-black/50 overflow-hidden backdrop-blur-md">
        <div 
          className="flex items-center justify-between px-5 py-3.5 bg-surfaceHover/60 cursor-pointer border-b border-borderSubtle hover:bg-surfaceHover transition-colors"
          onClick={() => toggleSection(dimension)}
        >
          <div className="flex items-center">
            <Layers className="w-4 h-4 text-primary mr-2" />
            <h3 className="font-semibold text-textMain text-sm uppercase tracking-widest font-mono">
              {dimension} 
              <span className="text-textMuted font-normal text-xs ml-2">[{items.length}]</span>
            </h3>
            {activeCount > 0 && (
              <span className="ml-3 bg-primary/20 border border-primary/50 text-primary text-[10px] px-2 py-0.5 rounded font-mono shadow-[0_0_8px_rgba(14,165,233,0.3)]">
                已生效: {activeCount}
              </span>
            )}
          </div>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-textMuted" /> : <ChevronDown className="w-4 h-4 text-textMuted" />}
        </div>
        
        {isExpanded && (
          <div className="p-5">
            {items.length > 10 && (
              <div className="relative mb-4">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-textMuted" />
                <input 
                  type="text" 
                  placeholder={`搜索 ${dimension}...`}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-borderSubtle text-textMain rounded focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono placeholder-zinc-600 transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerms({...searchTerms, [dimension]: e.target.value})}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {filteredItems.map(item => {
                const activeCond = conditions.find(c => c.dimension === dimension && c.value === item);
                const isActive = !!activeCond;
                
                return (
                  <div key={item} className={`flex items-center justify-between p-2.5 rounded border transition-all duration-200 ${
                    isActive ? 'bg-primary/10 border-primary shadow-[inset_0_0_12px_rgba(14,165,233,0.15)]' : 'bg-surface border-borderSubtle hover:border-zinc-500'
                  }`}>
                    <div className="flex items-center flex-1">
                      <input 
                        type="checkbox"
                        checked={isActive}
                        onChange={() => toggleCondition(dimension, item)}
                        className="w-4 h-4 text-primary bg-background rounded border-borderSubtle focus:ring-primary focus:ring-offset-background mr-3 cursor-pointer"
                      />
                      <span className={`text-sm font-mono ${isActive ? 'font-bold text-primary drop-shadow-[0_0_5px_rgba(14,165,233,0.5)]' : 'text-textMuted'}`}>
                        {item}
                      </span>
                    </div>
                    
                    {isActive && (
                      <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                        <select 
                          className="border border-primary/40 rounded px-2 py-1 text-sm bg-background text-primary focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none font-mono"
                          value={activeCond.operator}
                          onChange={(e) => updateCondition(dimension, item, 'operator', e.target.value)}
                        >
                          {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                        </select>
                        <div className="relative w-24">
                          <input 
                            type="number" 
                            className="w-full border border-primary/40 rounded pl-2 pr-6 py-1 text-sm font-mono text-primary bg-background focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none"
                            value={activeCond.target}
                            onChange={(e) => updateCondition(dimension, item, 'target', e.target.value)}
                          />
                          <span className="absolute right-2 top-1 text-primary/60 text-xs pointer-events-none">
                            {activeCond.operator === '≈' ? '%' : '题'}
                          </span>
                        </div>
                        <button 
                          onClick={() => toggleCondition(dimension, item)}
                          className="text-textMuted hover:text-red-400 transition-colors p-1"
                          title="移除条件"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
              {filteredItems.length === 0 && <span className="text-textMuted text-sm py-4 text-center font-mono">未找到匹配的标签。</span>}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPreviewModal = () => {
    if (!previewData) return null;
    const { stats, total } = previewData;
    
    // Process stats into arrays for Recharts
    const COLORS = ['#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6', '#6366f1'];
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8 animate-in fade-in duration-300">
        <div className="bg-surface border border-borderSubtle rounded-xl shadow-[0_0_50px_rgba(14,165,233,0.15)] w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
          <div className="p-6 border-b border-borderSubtle flex items-center justify-between bg-surfaceHover/30">
            <div>
              <h2 className="text-2xl font-black text-textMain font-mono tracking-widest drop-shadow-[0_0_8px_rgba(255,255,255,0.1)] flex items-center">
                <Target className="w-6 h-6 text-primary mr-3" />
                评测集分布总览
              </h2>
              <p className="text-textMuted text-sm font-mono mt-1">
                成功抽取 <span className="text-primary font-bold text-lg">{total}</span> 道题 | 缓存ID: {previewData.preview_id.split('-')[0]}
              </p>
            </div>
            <button onClick={() => setPreviewData(null)} className="text-textMuted hover:text-red-400 transition-colors p-2 rounded-full hover:bg-surface">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-surface via-background to-background custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {priorities.map(dim => {
                const dimStats = stats[dim] || {};
                const data = Object.keys(dimStats).map(k => ({ name: k, value: dimStats[k] })).sort((a,b)=>b.value - a.value);
                if (data.length === 0) return null;
                
                const isPie = data.length <= 5;
                
                const tooltipBg = isDark ? '#18181b' : '#ffffff';
                const tooltipBorder = isDark ? '#3f3f46' : '#e4e4e7';
                const tooltipText = isDark ? '#ffffff' : '#18181b';
                const cursorFill = isDark ? '#27272a' : '#f4f4f5';
                
                return (
                  <div key={dim} className="bg-surface border border-borderSubtle rounded-lg p-5 shadow-lg relative overflow-hidden group hover:border-primary/30 transition-colors">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary/50 group-hover:bg-primary transition-colors"></div>
                    <h3 className="text-sm font-bold text-textMain mb-4 font-mono flex items-center">
                      <Layers className="w-4 h-4 text-primary mr-2" />
                      {dim}
                      <span className="ml-2 text-xs text-textMuted font-normal bg-background px-2 py-0.5 rounded border border-borderSubtle">
                        {data.length} 类
                      </span>
                    </h3>
                    
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        {isPie ? (
                          <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                            <Pie data={data} innerRadius={35} outerRadius={55} paddingAngle={2} dataKey="value" stroke="none" label={({name, percent}) => `${name}(${(percent * 100).toFixed(0)}%)`} labelLine={false} style={{fontSize: '10px', fill: '#a1a1aa', fontFamily: 'monospace'}}>
                              {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="drop-shadow-[0_0_3px_rgba(255,255,255,0.3)]" />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: '8px', fontSize: '12px', color: tooltipText}} itemStyle={{color: tooltipText}} />
                          </PieChart>
                        ) : (
                          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={140} tick={{fill: '#a1a1aa', fontSize: 10, fontFamily: 'monospace'}} axisLine={false} tickLine={false} />
                            <Tooltip cursor={{fill: cursorFill}} contentStyle={{backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: '8px', fontSize: '12px', color: tooltipText}} itemStyle={{color: tooltipText}} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16}>
                              {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          
          <div className="p-6 border-t border-borderSubtle bg-surface flex justify-end items-center gap-4">
            <div className="flex-1">
              <button 
                onClick={() => setPreviewData(null)}
                className="text-textMuted hover:text-textMain transition-colors font-mono text-sm uppercase tracking-widest flex items-center"
              >
                <X className="w-4 h-4 mr-1" /> 放弃并重新调整
              </button>
            </div>
            
            <button 
              onClick={() => downloadPreview('template')}
              className="px-6 py-2 rounded text-primary border border-primary/40 hover:bg-primary/10 transition-all font-mono text-sm flex items-center shadow-[0_0_10px_rgba(14,165,233,0.1)] active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              下载推理模版
            </button>
            
            <button 
              onClick={() => downloadPreview('full')}
              className="bg-primary hover:bg-primary/90 text-white px-8 py-2 rounded font-bold flex items-center shadow-[0_0_15px_rgba(14,165,233,0.4)] font-mono text-sm tracking-wider transition-all hover:scale-105 active:scale-95"
            >
              <Play className="w-4 h-4 mr-2" fill="currentColor" />
              下载完整评测集
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen bg-background flex flex-col font-sans selection:bg-primary/30 transition-colors duration-300 ${isDark ? 'dark' : ''}`} onDragEnter={handleDrag}>
      {renderPreviewModal()}
      {/* Header */}
      <header className="bg-surface border-b border-borderSubtle sticky top-0 z-10 px-6 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center">
          <div className="bg-primary/10 border border-primary/30 text-primary p-2 rounded mr-3 shadow-[0_0_10px_rgba(14,165,233,0.2)]">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-textMain tracking-widest uppercase font-mono">
              Eval<span className="text-primary">Gen</span>
            </h1>
            <p className="text-[10px] text-textMuted font-mono tracking-widest uppercase opacity-80">智能评测集生成控制台</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsDark(!isDark)}
            className="p-1.5 rounded-full border border-borderSubtle bg-background text-textMuted hover:text-primary hover:border-primary/50 transition-colors"
            title="切换主题"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          
          <div className="text-sm flex items-center">
            <span className="text-textMuted mr-3 font-mono text-xs uppercase tracking-widest">数据源:</span>
            <select 
              className="border border-borderSubtle rounded px-3 py-1.5 text-sm bg-background text-textMain font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary min-w-[250px]"
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
            >
              {datasets.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="h-6 w-px bg-borderSubtle mx-2"></div>
          
          <button 
            onClick={() => handleGenerate('full')}
            className="bg-primary hover:bg-primary/90 transition-all text-white px-6 py-2 rounded font-bold flex items-center shadow-[0_0_20px_rgba(14,165,233,0.3)] font-mono text-sm uppercase tracking-wider active:scale-95"
          >
            <Target className="w-4 h-4 mr-2" />
            预览评测集分布
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Settings & Priorities */}
        <div className="w-80 bg-surface border-r border-borderSubtle flex flex-col overflow-y-auto">
          
          {/* File Upload Zone */}
          <div className="p-6 border-b border-borderSubtle">
            <h2 className="text-xs font-black text-textMain mb-4 flex items-center tracking-widest uppercase font-mono">
              <UploadCloud className="w-4 h-4 mr-2 text-primary" /> 数据源上传
            </h2>
            <div 
              className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-colors cursor-pointer ${dragActive ? 'border-primary bg-primary/10' : 'border-borderSubtle hover:border-primary/50 hover:bg-background'}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx" onChange={handleChange} />
              
              {uploading ? (
                <Loader2 className="w-6 h-6 text-primary animate-spin mb-2" />
              ) : (
                <UploadCloud className={`w-6 h-6 mb-2 ${dragActive ? 'text-primary' : 'text-textMuted'}`} />
              )}
              
              <p className="text-xs text-textMuted text-center font-mono">
                {uploading ? '正在上传及解析...' : '拖拽 Excel 文件至此或点击上传'}
              </p>
            </div>
          </div>

          <div className="p-6 border-b border-borderSubtle">
            <h2 className="text-xs font-black text-textMain mb-4 flex items-center tracking-widest uppercase font-mono">
              <Settings2 className="w-4 h-4 mr-2 text-primary" /> 全局设定
            </h2>
            <div className="mb-2 bg-background p-4 rounded border border-borderSubtle">
              <label className="block text-[10px] text-primary mb-2 font-bold uppercase tracking-widest font-mono">目标总题数</label>
              <div className="relative">
                <input 
                  type="number" 
                  className="w-full border border-borderSubtle rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-surface text-textMain"
                  value={totalCount}
                  onChange={(e) => setTotalCount(Number(e.target.value))}
                />
                <span className="absolute right-3 top-2 text-textMuted text-xs font-mono">道</span>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            <h2 className="text-xs font-black text-textMain mb-2 flex items-center tracking-widest uppercase font-mono">
              降级截断优先级
            </h2>
            <p className="text-[10px] text-textMuted mb-5 leading-relaxed font-mono uppercase">
              拖拽或点击箭头调整排序。<br/>数据量冲突时，系统优先保证排名靠前的维度。
            </p>
            
            <div className="space-y-2">
              {priorities.map((p, idx) => (
                <div key={p} className="flex items-center bg-background border border-borderSubtle rounded px-3 py-2 shadow-sm group hover:border-primary/50 transition-colors">
                  <span className="text-[10px] font-bold text-background bg-textMuted rounded w-4 h-4 flex items-center justify-center mr-3 group-hover:bg-primary transition-colors font-mono">{idx + 1}</span>
                  <span className="flex-1 text-sm font-bold text-textMain font-mono">{p}</span>
                  <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => movePriority(idx, -1)} disabled={idx === 0} className="text-textMuted hover:text-primary disabled:opacity-30 pb-0.5">
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button onClick={() => movePriority(idx, 1)} disabled={idx === priorities.length - 1} className="text-textMuted hover:text-primary disabled:opacity-30 pt-0.5">
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Area: Inline Schema Catalog & Conditions */}
        <div className="flex-1 bg-background p-8 overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-surface via-background to-background" onDragEnter={handleDrag}>
          <div className="flex items-center justify-between mb-8 border-b border-borderSubtle pb-6">
            <div>
              <h2 className="text-xl font-black text-textMain mb-2 font-mono uppercase tracking-widest drop-shadow-[0_0_8px_rgba(255,255,255,0.1)]">动态标签库</h2>
              <p className="text-xs text-textMuted font-mono">
                &gt; 正在读取: <span className="text-primary">{selectedFile || '无'}</span><br/>
                &gt; 状态: <span className="text-green-500">已连接。实时数据映射已启用。</span>
              </p>
            </div>
            <div className="bg-surface px-4 py-3 rounded border border-primary/30 shadow-[0_0_15px_rgba(14,165,233,0.1)] flex items-center gap-3">
              <Database className="w-5 h-5 text-primary" />
              <span className="text-xs text-textMuted font-mono uppercase tracking-widest">
                已生效的条件: <span className="font-bold text-primary text-lg ml-1">{conditions.length}</span>
              </span>
            </div>
          </div>
          
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
              <p className="text-primary text-sm font-mono uppercase tracking-widest animate-pulse">正在解析底层标签架构...</p>
              <p className="text-textMuted text-xs font-mono mt-2">请稍候...</p>
            </div>
          ) : (
            <div className="max-w-4xl space-y-4">
              {priorities.map(p => renderSection(p))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
