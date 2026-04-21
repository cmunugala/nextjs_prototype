'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle2, Download, RefreshCcw, Loader2, FileSpreadsheet, X, Search, MapPin, Trash2, Save, Info, Plus, Globe } from 'lucide-react';

interface Mapping {
    country: string;
    confidence: number;
    description: string;
}

interface AnimalResult {
    id: string;
    Animal: string;
    AnimalDescription: string;
    Mappings: Mapping[];
}

interface CountryInfo {
    country: string;
    description: string;
}

interface WorkflowProps {
  id: string;
  name: string;
}

const API_BASE_URL = 'http://localhost:8000';
const LOCAL_STORAGE_KEY = 'databridge_last_job_id';

export default function Workflow({ id, name }: WorkflowProps) {
  const [animalFile, setAnimalFile] = useState<File | null>(null);
  const [countryFile, setCountryFile] = useState<File | null>(null);
  
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<string>('idle'); 
  const [results, setResults] = useState<AnimalResult[] | null>(null);
  const [availableCountries, setAvailableCountries] = useState<CountryInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeAnimalId, setActiveAnimalId] = useState<string | null>(null);
  const [modalSearch, setModalSearch] = useState('');

  // 1. Initial Load: Check for saved state
  useEffect(() => {
    const savedJobId = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedJobId) {
        resumeJob(savedJobId);
    }
  }, []);

  const resumeJob = async (id: string) => {
    setJobId(id);
    setStatus('processing'); 
    try {
        const res = await fetch(`${API_BASE_URL}/api/status/${id}`);
        const data = await res.json();
        
        if (data.error) {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            setStatus('idle');
            return;
        }

        setProgress(data.progress);
        setStatus(data.status);

        if (data.status === 'completed') {
            fetchResults(id);
        }
    } catch (error) {
        console.error("Failed to resume job:", error);
        setStatus('idle');
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if ((status === 'processing' || status === 'queued') && jobId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/status/${jobId}`);
          const data = await res.json();
          setProgress(data.progress);
          setStatus(data.status);
          
          if (data.status === 'completed') {
            fetchResults(jobId);
            clearInterval(interval);
          }
        } catch (error) {
          console.error("Error fetching status:", error);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status, jobId]);

  const fetchResults = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/results/${id}`);
      const data = await res.json();
      setResults(data.data);
      setAvailableCountries(data.available_countries || []);
    } catch (error) {
      console.error("Error fetching results:", error);
    }
  };

  const handleUpload = async () => {
    setStatus('uploading');
    setResults(null);
    const formData = new FormData();
    if (animalFile) formData.append('animals', animalFile);
    if (countryFile) formData.append('countries', countryFile);

    try {
      const res = await fetch(`${API_BASE_URL}/api/upload/${id}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      setJobId(data.job_id);
      localStorage.setItem(LOCAL_STORAGE_KEY, data.job_id); 
      setStatus('processing');
    } catch (error) {
      console.error("Upload failed:", error);
      setStatus('idle');
    }
  };

  const handleRemoveMapping = (e: React.MouseEvent, animalId: string, countryName: string) => {
    e.stopPropagation();
    if (!results || !jobId) return;

    const newResults = results.map(item => {
        if (item.id === animalId) {
            return {
                ...item,
                Mappings: item.Mappings.filter(m => m.country !== countryName)
            };
        }
        return item;
    });

    setResults(newResults);
    syncWithBackend(newResults);
  };

  const handleAddCountry = (country: CountryInfo) => {
    if (!results || !jobId || !activeAnimalId) return;

    const animal = results.find(a => a.id === activeAnimalId);
    if (animal?.Mappings.some(m => m.country === country.country)) {
        setIsModalOpen(false);
        return;
    }

    const newResults = results.map(item => {
        if (item.id === activeAnimalId) {
            return {
                ...item,
                Mappings: [
                    ...item.Mappings,
                    {
                        country: country.country,
                        confidence: 0.95,
                        description: country.description
                    }
                ]
            };
        }
        return item;
    });

    setResults(newResults);
    syncWithBackend(newResults);
    setIsModalOpen(false);
    setActiveAnimalId(null);
    setModalSearch('');
  };

  const syncWithBackend = async (data: AnimalResult[]) => {
    setIsSyncing(true);
    try {
        await fetch(`${API_BASE_URL}/api/results/${jobId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    } catch (error) {
        console.error("Sync failed:", error);
    } finally {
        setIsSyncing(false);
    }
  };

  const handleDownload = () => {
    if (!results) return;

    // RUTHLESS SIMPLIFICATION: Generate CSV directly in the browser
    const headers = ["Animal", "Countries", "Confidence Scores"];
    const csvContent = results.map(row => {
        const countries = row.Mappings.map(m => m.country).join("; ");
        const confidences = row.Mappings.map(m => m.confidence).join("; ");
        return `"${row.Animal}","${countries}","${confidences}"`;
    });

    const finalCsv = [headers.join(","), ...csvContent].join("\n");
    const blob = new Blob([finalCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `animal_results_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const reset = () => {
    setAnimalFile(null);
    setCountryFile(null);
    setJobId(null);
    setProgress(0);
    setStatus('idle');
    setResults(null);
    setSearchTerm('');
    localStorage.removeItem(LOCAL_STORAGE_KEY); 
  };

  const filteredResults = results?.filter(row => 
    row.Animal.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.Mappings.some(m => m.country.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredModalCountries = availableCountries.filter(c => 
    c.country.toLowerCase().includes(modalSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Country Selection Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Add Country Mapping</h3>
                        <p className="text-slate-400 text-xs">Select a country to add to this animal.</p>
                    </div>
                    <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <div className="p-4">
                    <div className="relative mb-4">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            autoFocus
                            type="text" 
                            placeholder="Search countries..." 
                            value={modalSearch}
                            onChange={(e) => setModalSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-mongo-sage/20 transition-all"
                        />
                    </div>
                    <div className="max-h-80 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200">
                        <div className="space-y-1">
                            {filteredModalCountries.map((c, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleAddCountry(c)}
                                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-mongo-mist transition-colors group text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-mongo-sage transition-colors">
                                            <Globe className="w-4 h-4" />
                                        </div>
                                        <span className="text-sm font-bold text-slate-700">{c.country}</span>
                                    </div>
                                    <Plus className="w-4 h-4 text-slate-300 group-hover:text-mongo-sage opacity-0 group-hover:opacity-100 transition-all" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm transition-all">
        <div className="p-8 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Workflow: {name}</h3>
            <p className="text-slate-500 text-xs">Sessions are automatically saved and will persist after refresh.</p>
          </div>
          {status !== 'idle' && (
             <button onClick={reset} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                <X className="w-5 h-5" />
             </button>
          )}
        </div>

        <div className="p-8">
          {status === 'idle' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FileUploadCard label="Animal List" file={animalFile} onFileSelect={setAnimalFile} />
                <FileUploadCard label="Country List" file={countryFile} onFileSelect={setCountryFile} />
              </div>
              <div className="pt-4 flex justify-end">
                <button
                  disabled={!animalFile || !countryFile}
                  onClick={handleUpload}
                  className={`flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-bold transition-all shadow-sm
                    ${(animalFile && countryFile) ? 'bg-mongo-green text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}
                  `}
                >
                  <RefreshCcw className="w-4 h-4" />
                  Generate Mappings
                </button>
              </div>
            </div>
          )}

          {(status === 'uploading' || status === 'processing' || status === 'queued') && (
            <div className="space-y-6 py-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-mongo-mist rounded-xl text-mongo-sage">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{status === 'queued' ? 'In Queue' : 'Processing Data'}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Restoring Session...</p>
                  </div>
                </div>
                <span className="text-sm font-black text-mongo-sage">{progress}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="bg-mongo-sage h-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          )}

          {status === 'completed' && results && (
            <div className="space-y-8 py-2 animate-in fade-in duration-500">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">State Restored</h3>
                        <p className="text-slate-500 text-xs">Pick up exactly where you left off.</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="relative flex-1 md:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Filter results..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-mongo-sage/20 transition-all"
                        />
                    </div>
                    {isSyncing && (
                        <span className="flex items-center gap-1.5 text-[10px] font-bold text-mongo-orange animate-pulse">
                            <Save className="w-3 h-3" /> SAVING
                        </span>
                    )}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                    <table className="w-full text-left border-collapse table-auto">
                        <thead className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-sm border-b border-slate-100">
                            <tr>
                                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-1/3">Animal</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Country Mappings & Confidence</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredResults?.map((item) => (
                                <tr key={item.id} className="group hover:bg-slate-50/30 transition-colors">
                                    <td className="px-4 py-3 align-middle">
                                        <div className="relative inline-block group/tooltip">
                                            <div className="flex items-center gap-1.5 cursor-help">
                                                <span className="font-bold text-slate-800 text-sm border-b border-dotted border-slate-300 group-hover/tooltip:border-mongo-sage group-hover/tooltip:text-mongo-dark transition-all">
                                                    {item.Animal}
                                                </span>
                                                <Info className="w-2.5 h-2.5 text-slate-300 group-hover/tooltip:text-mongo-sage transition-colors" />
                                            </div>
                                            <div className="absolute left-0 bottom-full mb-2 w-64 p-3 bg-mongo-dark text-white text-[11px] rounded-lg shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none">
                                                <p className="font-bold mb-1 text-mongo-sage uppercase tracking-widest text-[9px]">Animal Profile</p>
                                                {item.AnimalDescription}
                                                <div className="absolute left-4 top-full w-2 h-2 bg-mongo-dark rotate-45 -translate-y-1"></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-2 items-center">
                                            {item.Mappings.map((m, idx) => (
                                                <div 
                                                    key={idx} 
                                                    className="relative group/tag flex items-center gap-2 px-2 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-mongo-sage/50 hover:bg-mongo-mist/10 transition-all shadow-sm active:scale-[0.98]"
                                                >
                                                    <div className="absolute left-0 bottom-full mb-2 w-64 p-3 bg-slate-800 text-white text-[11px] rounded-lg shadow-xl opacity-0 invisible group-hover/tag:opacity-100 group-hover/tag:visible transition-all z-50 pointer-events-none">
                                                        <p className="font-bold mb-1 text-mongo-sage uppercase tracking-widest text-[9px]">Country Context</p>
                                                        {m.description}
                                                        <div className="absolute left-4 top-full w-2 h-2 bg-slate-800 rotate-45 -translate-y-1"></div>
                                                    </div>

                                                    <MapPin className="w-3 h-3 text-mongo-sage" />
                                                    <span className="text-xs font-semibold text-slate-700">{m.country}</span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${m.confidence > 0.9 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                        {(m.confidence * 100).toFixed(0)}%
                                                    </span>
                                                    <button 
                                                        onClick={(e) => handleRemoveMapping(e, item.id, m.country)}
                                                        className="w-4 h-4 rounded flex items-center justify-center text-slate-300 hover:bg-red-100 hover:text-red-600 transition-all ml-1"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                            
                                            <button 
                                                onClick={() => {
                                                    setActiveAnimalId(item.id);
                                                    setIsModalOpen(true);
                                                }}
                                                className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-mongo-sage hover:text-mongo-sage hover:bg-mongo-mist/10 transition-all group shadow-sm"
                                            >
                                                <Plus className="w-3 h-3 group-hover:scale-125 transition-transform" />
                                                <span className="text-[10px] font-bold uppercase tracking-widest">Add</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-slate-50">
                <button 
                  onClick={handleDownload}
                  className="flex-1 flex items-center justify-center gap-2 bg-mongo-green text-white px-8 py-4 rounded-xl text-sm font-bold transition-all hover:bg-slate-800 shadow-md active:scale-[0.99]"
                >
                  <Download className="w-4 h-4" />
                  Download Processed CSV
                </button>
                <button 
                  onClick={reset}
                  className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-8 py-4 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all"
                >
                  <RefreshCcw className="w-4 h-4" />
                  New Job
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-50/50 px-8 py-3 flex items-center justify-between text-[9px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100">
          <span>Job ID: <span className={jobId ? 'text-mongo-orange' : 'text-slate-300'}>{jobId || '---'}</span></span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-mongo-sage"></span>
            Serverless File System
          </span>
        </div>
      </div>
    </div>
  );
}

function FileUploadCard({ label, file, onFileSelect }: { label: string, file: File | null, onFileSelect: (f: File | null) => void }) {
  const inputId = React.useId();
  return (
    <div className="relative flex-1">
        <input id={inputId} type="file" accept=".csv" className="hidden" onChange={(e) => onFileSelect(e.target.files?.[0] || null)} />
        <label htmlFor={inputId} className={`group flex flex-col items-center justify-center w-full h-44 border-2 border-dashed rounded-xl transition-all duration-200 cursor-pointer
            ${file ? 'border-mongo-sage bg-mongo-mist/20' : 'border-slate-200 bg-white hover:border-mongo-sage hover:bg-slate-50/50'}
        `}>
            <span className="flex flex-col items-center px-4">
                <span className={`p-4 rounded-2xl mb-3 transition-all flex items-center justify-center ${file ? 'bg-mongo-sage text-white' : 'bg-slate-50 text-slate-400 group-hover:bg-white group-hover:shadow-sm'}`}>
                    <FileSpreadsheet className="w-6 h-6" />
                </span>
                <span className="text-xs font-bold text-slate-700 mb-1">{label}</span>
                <span className="text-[10px] text-slate-400 font-medium truncate max-w-[140px] block">{file ? file.name : 'Choose CSV...'}</span>
            </span>
        </label>
        {file && (
            <button onClick={() => onFileSelect(null)} className="absolute top-3 right-3 p-1.5 bg-white border border-slate-100 rounded-lg shadow-sm text-slate-400 hover:text-red-500 transition-colors">
                <X className="w-3.5 h-3.5" />
            </button>
        )}
    </div>
  );
}
