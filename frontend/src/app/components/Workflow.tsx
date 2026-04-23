'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  Globe,
  Info,
  MapPin,
  Plus,
  RefreshCcw,
  Save,
  Search,
  X,
} from 'lucide-react';

interface Mapping {
  country: string;
  confidence: number;
  description: string;
}

interface AnimalResult {
  id: string;
  Animal: string;
  AnimalDescription: string;
  TypeOfOrganism: string;
  InterestingFact: string;
  RecommendedCountries: Mapping[];
  FinalizedCountries: Mapping[];
  Compliant: string;
  IdentifiedGaps: string;
}

interface CountryInfo {
  country: string;
  description: string;
}

interface WorkflowJob {
  job_id: string;
  status: string;
  progress: number;
  created_at: string;
  animal_filename: string;
  country_filename: string;
}

interface WorkflowProps {
  id: string;
}

interface FloatingTooltip {
  title: string;
  content: string;
  x: number;
  y: number;
}

type WorkflowViewMode = 'list' | 'detail';
type AnimalSortOrder = 'none' | 'asc' | 'desc';

const API_BASE_URL = 'http://localhost:8000';
const LOCAL_STORAGE_KEY = 'databridge_last_job_id';
const ACTIVE_JOB_STATUSES = new Set(['queued', 'processing']);
const JOBS_PER_PAGE = 5;
const RESULT_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const DEFAULT_RESULTS_PER_PAGE = 10;
const DETAIL_CELL_HEIGHT_CLASS = 'h-16';
const COMPLIANCE_OPTIONS = [
  '0% Not Compliant',
  '25% A little compliant',
  '50% Somewhat Compliant',
  '75% Mostly Compliant',
  '100% Fully Compliant',
] as const;
const DEFAULT_COMPLIANCE_OPTION = COMPLIANCE_OPTIONS[0];

function formatStatusLabel(status: string) {
  if (status === 'processing') return 'Running';
  if (status === 'queued') return 'Queued';
  if (status === 'completed') return 'Completed';
  if (status === 'failed') return 'Failed';
  return status;
}

function getStatusBadgeClass(status: string) {
  if (status === 'completed') return 'bg-green-50 text-green-700';
  if (status === 'failed') return 'bg-red-50 text-red-700';
  return 'bg-blue-50 text-blue-700';
}

function normalizeMappings(rawMappings: unknown): Mapping[] {
  if (!Array.isArray(rawMappings)) return [];

  return rawMappings.map((mapping) => {
    const item = mapping as Partial<Mapping>;
    const confidenceValue =
      typeof item.confidence === 'number' ? item.confidence : Number(item.confidence ?? 0);

    return {
      country: item.country ?? '',
      confidence: Number.isFinite(confidenceValue) ? confidenceValue : 0,
      description: item.description ?? 'No description available.',
    };
  });
}

function normalizeAnimalResult(rawRow: unknown): AnimalResult {
  const row = rawRow as Partial<AnimalResult> & { Mappings?: Mapping[] };
  const recommended = normalizeMappings(
    row.RecommendedCountries ?? row.Mappings ?? []
  );
  const finalized = normalizeMappings(row.FinalizedCountries ?? recommended);

  return {
    id: row.id ?? crypto.randomUUID().slice(0, 8),
    Animal: row.Animal ?? '',
    AnimalDescription: row.AnimalDescription ?? '',
    TypeOfOrganism: row.TypeOfOrganism ?? '',
    InterestingFact: row.InterestingFact ?? '',
    RecommendedCountries: recommended,
    FinalizedCountries: finalized,
    Compliant: row.Compliant ?? DEFAULT_COMPLIANCE_OPTION,
    IdentifiedGaps: row.IdentifiedGaps ?? '',
  };
}

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export default function Workflow(props: WorkflowProps) {
  const { id } = props;
  const [animalFile, setAnimalFile] = useState<File | null>(null);
  const [countryFile, setCountryFile] = useState<File | null>(null);

  const [jobs, setJobs] = useState<WorkflowJob[]>([]);
  const [jobPage, setJobPage] = useState(0);
  const [viewMode, setViewMode] = useState<WorkflowViewMode>('list');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobResults, setSelectedJobResults] = useState<AnimalResult[] | null>(null);
  const [availableCountries, setAvailableCountries] = useState<CountryInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [animalSortOrder, setAnimalSortOrder] = useState<AnimalSortOrder>('none');
  const [resultsPage, setResultsPage] = useState(0);
  const [resultsPerPage, setResultsPerPage] = useState(DEFAULT_RESULTS_PER_PAGE);
  const [isSyncing, setIsSyncing] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeAnimalId, setActiveAnimalId] = useState<string | null>(null);
  const [modalSearch, setModalSearch] = useState('');

  const [isGapModalOpen, setIsGapModalOpen] = useState(false);
  const [gapEditorAnimalId, setGapEditorAnimalId] = useState<string | null>(null);
  const [gapDraft, setGapDraft] = useState('');

  const [tooltip, setTooltip] = useState<FloatingTooltip | null>(null);
  const selectedJob = jobs.find((job) => job.job_id === selectedJobId) ?? null;

  const showTooltip = (
    event: React.MouseEvent<HTMLElement>,
    title: string,
    content: string
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const margin = 12;
    const tooltipWidth = 224;
    const estimatedTooltipHeight = 112;
    const hasRightSpace = rect.right + margin + tooltipWidth <= window.innerWidth;

    const x = hasRightSpace
      ? rect.right + margin
      : Math.max(margin, rect.left - tooltipWidth - margin);
    const y = Math.min(
      Math.max(margin, rect.top + rect.height / 2 - estimatedTooltipHeight / 2),
      window.innerHeight - estimatedTooltipHeight - margin
    );

    setTooltip({ title, content, x, y });
  };

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/history`);
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching workflow history:', error);
    }
  }, []);

  const fetchResults = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/results/${jobId}`);
      const data = await res.json();

      if (data.error) {
        return;
      }

      const normalizedRows = Array.isArray(data.data)
        ? data.data.map(normalizeAnimalResult)
        : [];

      setSelectedJobResults(normalizedRows);
      setAvailableCountries(data.available_countries || []);
    } catch (error) {
      console.error('Error fetching results:', error);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    const savedJobId = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!savedJobId) return;
    setSelectedJobId(savedJobId);
  }, [fetchHistory]);

  useEffect(() => {
    const activeJobs = jobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status));
    if (activeJobs.length === 0) return;

    const interval = setInterval(async () => {
      try {
        const updates = await Promise.all(
          activeJobs.map(async (job) => {
            const res = await fetch(`${API_BASE_URL}/api/status/${job.job_id}`);
            const data = await res.json();
            if (data.error) return null;
            return data as Pick<WorkflowJob, 'job_id' | 'status' | 'progress'>;
          })
        );

        setJobs((currentJobs) =>
          currentJobs.map((job) => {
            const update = updates.find((item) => item?.job_id === job.job_id);
            return update
              ? {
                  ...job,
                  status: update.status,
                  progress: update.progress,
                }
              : job;
          })
        );
      } catch (error) {
        console.error('Error polling job statuses:', error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [jobs]);

  const closeCountryModal = () => {
    setIsModalOpen(false);
    setActiveAnimalId(null);
    setModalSearch('');
    setTooltip(null);
  };

  const openGapEditor = (animalId: string, currentNote: string) => {
    setGapEditorAnimalId(animalId);
    setGapDraft(currentNote);
    setIsGapModalOpen(true);
    setTooltip(null);
  };

  const closeGapEditor = () => {
    setIsGapModalOpen(false);
    setGapEditorAnimalId(null);
    setGapDraft('');
  };

  const openJobDetail = async (jobId: string) => {
    setSelectedJobId(jobId);
    setSelectedJobResults(null);
    setAvailableCountries([]);
    setSearchTerm('');
    setResultsPage(0);
    setTooltip(null);
    closeCountryModal();
    closeGapEditor();
    setViewMode('detail');
    localStorage.setItem(LOCAL_STORAGE_KEY, jobId);
    await fetchResults(jobId);
  };

  const handleUpload = async () => {
    if (!animalFile || !countryFile) return;

    const formData = new FormData();
    formData.append('animals', animalFile);
    formData.append('countries', countryFile);

    try {
      const res = await fetch(`${API_BASE_URL}/api/upload/${id}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!data.job_id) {
        return;
      }

      const newJob: WorkflowJob = {
        job_id: data.job_id,
        status: data.status ?? 'queued',
        progress: data.progress ?? 0,
        created_at: data.created_at ?? new Date().toISOString(),
        animal_filename: data.animal_filename ?? animalFile.name,
        country_filename: data.country_filename ?? countryFile.name,
      };

      setJobs((currentJobs) => [
        newJob,
        ...currentJobs.filter((job) => job.job_id !== newJob.job_id),
      ]);
      setJobPage(0);
      setSelectedJobId(newJob.job_id);
      localStorage.setItem(LOCAL_STORAGE_KEY, newJob.job_id);
      setAnimalFile(null);
      setCountryFile(null);
      setTooltip(null);
      closeCountryModal();
      closeGapEditor();
      setViewMode('list');
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  const syncWithBackend = async (data: AnimalResult[]) => {
    if (!selectedJobId) return;

    setIsSyncing(true);
    try {
      await fetch(`${API_BASE_URL}/api/results/${selectedJobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRemoveFinalizedCountry = (
    e: React.MouseEvent,
    animalId: string,
    countryName: string
  ) => {
    e.stopPropagation();
    if (!selectedJobResults) return;

    const newResults = selectedJobResults.map((item) => {
      if (item.id === animalId) {
        return {
          ...item,
          FinalizedCountries: item.FinalizedCountries.filter(
            (mapping) => mapping.country !== countryName
          ),
        };
      }
      return item;
    });

    setSelectedJobResults(newResults);
    syncWithBackend(newResults);
  };

  const handleAddCountry = (country: CountryInfo) => {
    if (!selectedJobResults || !activeAnimalId) return;

    const selectedAnimal = selectedJobResults.find((animal) => animal.id === activeAnimalId);
    if (
      selectedAnimal?.FinalizedCountries.some(
        (mapping) => mapping.country === country.country
      )
    ) {
      closeCountryModal();
      return;
    }

    const newResults = selectedJobResults.map((item) => {
      if (item.id === activeAnimalId) {
        return {
          ...item,
          FinalizedCountries: [
            ...item.FinalizedCountries,
            {
              country: country.country,
              confidence: 0.95,
              description: country.description,
            },
          ],
        };
      }
      return item;
    });

    setSelectedJobResults(newResults);
    syncWithBackend(newResults);
    closeCountryModal();
  };

  const handleSaveGapNote = () => {
    if (!selectedJobResults || !gapEditorAnimalId) return;

    const newResults = selectedJobResults.map((item) => {
      if (item.id === gapEditorAnimalId) {
        return {
          ...item,
          IdentifiedGaps: gapDraft.trim(),
        };
      }
      return item;
    });

    setSelectedJobResults(newResults);
    syncWithBackend(newResults);
    closeGapEditor();
  };

  const handleCompliantChange = (animalId: string, compliant: string) => {
    if (!selectedJobResults) return;

    const newResults = selectedJobResults.map((item) => {
      if (item.id === animalId) {
        return {
          ...item,
          Compliant: compliant,
        };
      }
      return item;
    });

    setSelectedJobResults(newResults);
    syncWithBackend(newResults);
  };

  const handleDownload = () => {
    if (!selectedJobResults) return;

    const headers = [
      'Animal',
      'Animal Description',
      'Type of Organism',
      'Recommended Countries',
      'Finalized Countries',
      'Compliant',
      'Identified Gaps',
      'Interesting Fact',
    ];

    const csvContent = selectedJobResults.map((row) => {
      const recommended = row.RecommendedCountries.map((mapping) => mapping.country).join('; ');
      const finalized = row.FinalizedCountries.map((mapping) => mapping.country).join('; ');

      return [
        escapeCsv(row.Animal),
        escapeCsv(row.AnimalDescription),
        escapeCsv(row.TypeOfOrganism),
        escapeCsv(recommended),
        escapeCsv(finalized),
        escapeCsv(row.Compliant),
        escapeCsv(row.IdentifiedGaps),
        escapeCsv(row.InterestingFact),
      ].join(',');
    });

    const finalCsv = [headers.join(','), ...csvContent].join('\n');
    const blob = new Blob([finalCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `animal_results_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredResults = selectedJobResults?.filter((row) => {
    const query = searchTerm.toLowerCase();

    return (
      row.Animal.toLowerCase().includes(query) ||
      row.AnimalDescription.toLowerCase().includes(query) ||
      row.TypeOfOrganism.toLowerCase().includes(query) ||
      row.InterestingFact.toLowerCase().includes(query) ||
      row.Compliant.toLowerCase().includes(query) ||
      row.IdentifiedGaps.toLowerCase().includes(query) ||
      row.RecommendedCountries.some((mapping) =>
        mapping.country.toLowerCase().includes(query)
      ) ||
      row.FinalizedCountries.some((mapping) => mapping.country.toLowerCase().includes(query))
    );
  });

  const filteredModalCountries = availableCountries.filter((country) =>
    country.country.toLowerCase().includes(modalSearch.toLowerCase())
  );
  const sortedResults = filteredResults
    ? animalSortOrder === 'none'
      ? filteredResults
      : [...filteredResults].sort((a, b) => {
          const comparison = a.Animal.localeCompare(b.Animal, undefined, {
            sensitivity: 'base',
          });
          return animalSortOrder === 'asc' ? comparison : -comparison;
        })
    : [];
  const totalResultCount = selectedJobResults?.length ?? 0;
  const filteredResultCount = sortedResults.length;
  const rowCountLabel = searchTerm
    ? `${filteredResultCount} / ${totalResultCount} rows`
    : `${totalResultCount} rows`;
  const totalResultPages = Math.max(
    1,
    Math.ceil(filteredResultCount / resultsPerPage || 0)
  );
  const paginatedResults = sortedResults.slice(
    resultsPage * resultsPerPage,
    resultsPage * resultsPerPage + resultsPerPage
  );
  const resultPageStart = filteredResultCount === 0 ? 0 : resultsPage * resultsPerPage + 1;
  const resultPageEnd = Math.min(
    (resultsPage + 1) * resultsPerPage,
    filteredResultCount
  );
  const totalJobPages = Math.max(1, Math.ceil(jobs.length / JOBS_PER_PAGE));
  const paginatedJobs = jobs.slice(
    jobPage * JOBS_PER_PAGE,
    jobPage * JOBS_PER_PAGE + JOBS_PER_PAGE
  );
  const pageStart = jobs.length === 0 ? 0 : jobPage * JOBS_PER_PAGE + 1;
  const pageEnd = Math.min((jobPage + 1) * JOBS_PER_PAGE, jobs.length);

  useEffect(() => {
    setJobPage((currentPage) => Math.min(currentPage, totalJobPages - 1));
  }, [totalJobPages]);

  useEffect(() => {
    setResultsPage(0);
  }, [searchTerm, animalSortOrder, resultsPerPage, selectedJobId]);

  useEffect(() => {
    setResultsPage((currentPage) => Math.min(currentPage, totalResultPages - 1));
  }, [totalResultPages]);

  return (
    <div className="space-y-6">
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Add Finalized Country</h3>
                <p className="text-slate-400 text-xs">
                  Select a country to add to the finalized list.
                </p>
              </div>
              <button
                onClick={closeCountryModal}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
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
                  {filteredModalCountries.map((country) => (
                    <button
                      key={country.country}
                      onClick={() => handleAddCountry(country)}
                      onMouseEnter={(e) =>
                        showTooltip(e, 'Country Context', country.description)
                      }
                      onMouseLeave={() => setTooltip(null)}
                      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-mongo-mist transition-colors group text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-mongo-sage transition-colors">
                          <Globe className="w-4 h-4" />
                        </div>
                        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                          {country.country}
                          <Info className="w-3 h-3 text-slate-300 group-hover:text-mongo-sage transition-colors" />
                        </span>
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

      {isGapModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Identified Gaps</h3>
                <p className="text-slate-400 text-xs">
                  Add any review notes or follow-up gaps for this row.
                </p>
              </div>
              <button
                onClick={closeGapEditor}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <textarea
                autoFocus
                value={gapDraft}
                onChange={(e) => setGapDraft(e.target.value)}
                placeholder="Enter any gaps, caveats, or review notes..."
                rows={5}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-mongo-sage/20 resize-none"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeGapEditor}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveGapNote}
                  className="inline-flex items-center gap-2 rounded-lg bg-mongo-green px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tooltip && (
        <div
          className="fixed z-[200] w-56 rounded-lg bg-slate-800 p-2.5 text-[10px] text-white shadow-xl pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="font-bold mb-1 text-mongo-sage uppercase tracking-widest text-[9px]">
            {tooltip.title}
          </p>
          {tooltip.content}
        </div>
      )}

      {viewMode === 'list' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FileUploadCard
              label="Upload Animal File"
              file={animalFile}
              onFileSelect={setAnimalFile}
            />
            <FileUploadCard
              label="Upload Country File"
              file={countryFile}
              onFileSelect={setCountryFile}
            />
          </div>

          <div className="flex justify-center md:justify-end">
            <button
              disabled={!animalFile || !countryFile}
              onClick={handleUpload}
              className={`flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-bold transition-all shadow-sm ${
                animalFile && countryFile
                  ? 'bg-mongo-green text-white hover:bg-slate-800'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <RefreshCcw className="w-4 h-4" />
              Generate Mappings
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b-2 border-slate-200">
                    <th className="px-4 py-4 text-sm font-bold text-slate-800 border-r border-slate-200">
                      Animal Upload File Name
                    </th>
                    <th className="px-4 py-4 text-sm font-bold text-slate-800 border-r border-slate-200">
                      Country Upload File Name
                    </th>
                    <th className="px-4 py-4 text-sm font-bold text-slate-800 border-r border-slate-200">
                      Job Date
                    </th>
                    <th className="px-4 py-4 text-sm font-bold text-slate-800 border-r border-slate-200">
                      Job Progress
                    </th>
                    <th className="px-4 py-4 text-sm font-bold text-slate-800 border-r border-slate-200">
                      Mapping
                    </th>
                    <th className="px-4 py-4 text-sm font-bold text-slate-800">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {jobs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-16 text-center text-slate-400 text-sm"
                      >
                        No submitted jobs yet.
                      </td>
                    </tr>
                  ) : (
                    paginatedJobs.map((job) => {
                      const progressValue = job.status === 'completed' ? 100 : job.progress;
                      return (
                        <tr key={job.job_id} className="align-middle">
                          <td className="px-4 py-5 border-r border-slate-200 text-sm font-medium text-slate-700">
                            {job.animal_filename}
                          </td>
                          <td className="px-4 py-5 border-r border-slate-200 text-sm font-medium text-slate-700">
                            {job.country_filename}
                          </td>
                          <td className="px-4 py-5 border-r border-slate-200 text-sm text-slate-500">
                            {job.created_at}
                          </td>
                          <td className="px-4 py-5 border-r border-slate-200">
                            <div className="space-y-2 max-w-[220px]">
                              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                <div
                                  className="bg-mongo-sage h-full transition-all duration-500"
                                  style={{ width: `${progressValue}%` }}
                                />
                              </div>
                              <div className="text-xs font-semibold text-slate-500">
                                {progressValue}%
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-5 border-r border-slate-200">
                            {job.status === 'completed' ? (
                              <button
                                onClick={() => openJobDetail(job.job_id)}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-mongo-green hover:bg-mongo-mist transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                                View
                              </button>
                            ) : (
                              <span className="text-sm text-slate-300 font-medium">--</span>
                            )}
                          </td>
                          <td className="px-4 py-5">
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${getStatusBadgeClass(job.status)}`}
                            >
                              {formatStatusLabel(job.status)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {jobs.length > JOBS_PER_PAGE && (
              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    Showing {pageStart}-{pageEnd}
                  </span>
                  <span>of {jobs.length} jobs</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setJobPage((currentPage) => Math.max(0, currentPage - 1))}
                    disabled={jobPage === 0}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                    aria-label="Previous jobs page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setJobPage((currentPage) => Math.min(totalJobPages - 1, currentPage + 1))
                    }
                    disabled={jobPage >= totalJobPages - 1}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                    aria-label="Next jobs page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm transition-all">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/30">
            <button
              onClick={() => {
                setViewMode('list');
                setTooltip(null);
              }}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-mongo-sage transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Jobs
            </button>
            {selectedJob && (
              <p className="mt-2 text-[11px] text-slate-400">{selectedJob.created_at}</p>
            )}
          </div>

          <div className="p-5">
            {!selectedJobResults ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400">
                <RefreshCcw className="w-8 h-8 animate-spin mb-4" />
                <p className="text-sm font-medium">Loading job results...</p>
              </div>
            ) : (
              <div className="space-y-3 py-0.5 animate-in fade-in duration-500">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
                    <span className="hidden sm:inline-flex h-7 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {rowCountLabel}
                    </span>
                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      <span>Sort</span>
                      <select
                        value={animalSortOrder}
                        onChange={(e) => setAnimalSortOrder(e.target.value as AnimalSortOrder)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold normal-case tracking-normal text-slate-600 focus:outline-none focus:ring-2 focus:ring-mongo-sage/20"
                      >
                        <option value="none">None</option>
                        <option value="asc">Sort by Animal Ascending</option>
                        <option value="desc">Sort by Animal Descending</option>
                      </select>
                    </label>
                    <div className="relative flex-1 md:w-56">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Filter results..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-mongo-sage/20 transition-all"
                      />
                    </div>
                    {isSyncing && (
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-mongo-orange animate-pulse">
                        <Save className="w-3 h-3" />
                        SAVING
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                  <div className="max-h-[78vh] overflow-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                    <table className="min-w-[1820px] w-full text-left border-collapse table-fixed">
                      <thead className="sticky top-0 z-20 bg-slate-100/95 backdrop-blur-sm border-b border-slate-200 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
                        <tr>
                          <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide w-[150px] border-r border-slate-200">
                            Animal
                          </th>
                          <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide w-[360px] border-r border-slate-200">
                            Animal Description
                          </th>
                          <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide w-[150px] border-r border-slate-200">
                            Type of Organism
                          </th>
                          <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide w-[320px] border-r border-slate-200">
                            Recommended Countries
                          </th>
                          <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide w-[340px] border-r border-slate-200">
                            Finalized Countries
                          </th>
                          <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide w-[230px] border-r border-slate-200">
                            Compliant
                          </th>
                          <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide w-[240px] border-r border-slate-200">
                            Identified Gaps
                          </th>
                          <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide w-[360px]">
                            Interesting Fact
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedResults?.map((item) => (
                          <tr
                            key={item.id}
                            className="group even:bg-slate-50/20 hover:bg-slate-50/60 transition-colors align-top"
                          >
                            <td className="px-3 py-3 align-top border-r border-slate-100">
                              <div className={`${DETAIL_CELL_HEIGHT_CLASS} flex items-center`}>
                                <span className="font-bold text-slate-800 text-xs">
                                  {item.Animal}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top border-r border-slate-100">
                              <ScrollableTextCell text={item.AnimalDescription} />
                            </td>
                            <td className="px-3 py-3 align-top border-r border-slate-100">
                              <div className={`${DETAIL_CELL_HEIGHT_CLASS} flex items-center`}>
                                <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                  {item.TypeOfOrganism || '--'}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top border-r border-slate-100">
                              <div className={`${DETAIL_CELL_HEIGHT_CLASS} overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent`}>
                                <div className="flex flex-wrap gap-1.5 items-start content-start">
                                {item.RecommendedCountries.map((mapping, idx) => (
                                  <CountryChip
                                    key={`${mapping.country}-${idx}`}
                                    mapping={mapping}
                                    onMouseEnter={(e) =>
                                      showTooltip(e, 'Country Context', mapping.description)
                                    }
                                    onMouseLeave={() => setTooltip(null)}
                                  />
                                ))}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top border-r border-slate-100">
                              <div className={`${DETAIL_CELL_HEIGHT_CLASS} overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent`}>
                                <div className="flex flex-wrap gap-1.5 items-start content-start">
                                {item.FinalizedCountries.map((mapping, idx) => (
                                  <CountryChip
                                    key={`${mapping.country}-${idx}`}
                                    mapping={mapping}
                                    removable
                                    onMouseEnter={(e) =>
                                      showTooltip(e, 'Country Context', mapping.description)
                                    }
                                    onMouseLeave={() => setTooltip(null)}
                                    onRemove={(e) =>
                                      handleRemoveFinalizedCountry(e, item.id, mapping.country)
                                    }
                                  />
                                ))}

                                <button
                                  onClick={() => {
                                    setActiveAnimalId(item.id);
                                    setIsModalOpen(true);
                                  }}
                                  className="flex items-center justify-center gap-1 px-1.5 py-1 rounded-md border border-dashed border-slate-300 text-slate-400 hover:border-mongo-sage hover:text-mongo-sage hover:bg-mongo-mist/10 transition-all group shadow-sm"
                                >
                                  <Plus className="w-2.5 h-2.5 group-hover:scale-125 transition-transform" />
                                  <span className="text-[9px] font-bold uppercase tracking-wide">
                                    Add
                                  </span>
                                </button>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top border-r border-slate-100">
                              <div className={`${DETAIL_CELL_HEIGHT_CLASS} flex items-center`}>
                                <select
                                  value={item.Compliant}
                                  onChange={(e) =>
                                    handleCompliantChange(item.id, e.target.value)
                                  }
                                  className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-mongo-sage/20"
                                >
                                  {COMPLIANCE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top border-r border-slate-100">
                              <div className={`${DETAIL_CELL_HEIGHT_CLASS} flex items-center`}>
                                {item.IdentifiedGaps ? (
                                  <button
                                    type="button"
                                    onClick={() => openGapEditor(item.id, item.IdentifiedGaps)}
                                    className="w-full rounded-lg px-0 py-0 text-left hover:bg-slate-50/60 transition-colors"
                                  >
                                    <p className="text-[11px] leading-5 text-slate-600 whitespace-pre-wrap">
                                      {item.IdentifiedGaps}
                                    </p>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openGapEditor(item.id, item.IdentifiedGaps)}
                                    className="inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-slate-400 hover:border-mongo-sage hover:text-mongo-sage hover:bg-mongo-mist/10 transition-all"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span className="text-[9px] font-bold uppercase tracking-wide">
                                      Add
                                    </span>
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <ScrollableTextCell text={item.InterestingFact} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {filteredResultCount > 0 && (
                    <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:gap-4">
                        <span>
                          <span className="font-semibold text-slate-700">
                            Showing {resultPageStart}-{resultPageEnd}
                          </span>{' '}
                          of {filteredResultCount} rows
                        </span>
                        <label className="flex items-center gap-2">
                          <span>Rows per page</span>
                          <select
                            value={resultsPerPage}
                            onChange={(e) => setResultsPerPage(Number(e.target.value))}
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-mongo-sage/20"
                          >
                            {RESULT_PAGE_SIZE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          type="button"
                          onClick={() =>
                            setResultsPage((currentPage) => Math.max(0, currentPage - 1))
                          }
                          disabled={resultsPage === 0}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                          aria-label="Previous results page"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setResultsPage((currentPage) =>
                              Math.min(totalResultPages - 1, currentPage + 1)
                            )
                          }
                          disabled={resultsPage >= totalResultPages - 1}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                          aria-label="Next results page"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-50">
                  <button
                    onClick={handleDownload}
                    className="inline-flex items-center justify-center gap-2 bg-mongo-green text-white px-6 py-3 rounded-lg text-sm font-bold transition-all hover:bg-slate-800 shadow-md active:scale-[0.99]"
                  >
                    <Download className="w-4 h-4" />
                    Download Processed CSV
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CountryChip({
  mapping,
  removable = false,
  onMouseEnter,
  onMouseLeave,
  onRemove,
}: {
  mapping: Mapping;
  removable?: boolean;
  onMouseEnter: (event: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
  onRemove?: (event: React.MouseEvent) => void;
}) {
  return (
    <div
      className="relative group/tag flex items-center gap-1.5 px-1.5 py-1 rounded-md border border-slate-200 bg-white hover:border-mongo-sage/50 hover:bg-mongo-mist/10 transition-all shadow-sm active:scale-[0.98]"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <MapPin className="w-2.5 h-2.5 text-mongo-sage" />
      <span className="text-[11px] font-semibold text-slate-700">{mapping.country}</span>
      <span
        className={`px-1 py-0.5 rounded text-[8px] font-black ${
          mapping.confidence > 0.9
            ? 'bg-green-100 text-green-700'
            : 'bg-amber-100 text-amber-700'
        }`}
      >
        {(mapping.confidence * 100).toFixed(0)}%
      </span>
      {removable && onRemove && (
        <button
          onClick={onRemove}
          className="w-3.5 h-3.5 rounded flex items-center justify-center text-slate-300 hover:bg-red-100 hover:text-red-600 transition-all ml-0.5"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

function ScrollableTextCell({ text }: { text: string }) {
  return (
    <div className={`${DETAIL_CELL_HEIGHT_CLASS} overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent`}>
      <p className="text-[11px] leading-5 text-slate-600 whitespace-pre-wrap">
        {text || '--'}
      </p>
    </div>
  );
}

function FileUploadCard({
  label,
  file,
  onFileSelect,
}: {
  label: string;
  file: File | null;
  onFileSelect: (f: File | null) => void;
}) {
  const inputId = React.useId();

  return (
    <div className="relative flex-1">
      <input
        id={inputId}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => onFileSelect(e.target.files?.[0] || null)}
      />
      <label
        htmlFor={inputId}
        className={`group flex flex-col items-center justify-center w-full h-52 border-2 border-dashed rounded-xl transition-all duration-200 cursor-pointer ${
          file
            ? 'border-mongo-sage bg-mongo-mist/20'
            : 'border-slate-300 bg-white hover:border-mongo-sage hover:bg-slate-50/50'
        }`}
      >
        <span className="flex flex-col items-center px-4">
          <span
            className={`p-4 rounded-2xl mb-3 transition-all flex items-center justify-center ${
              file
                ? 'bg-mongo-sage text-white'
                : 'bg-slate-50 text-slate-400 group-hover:bg-white group-hover:shadow-sm'
            }`}
          >
            <FileSpreadsheet className="w-6 h-6" />
          </span>
          <span className="text-lg font-bold text-slate-800 mb-1">{label}</span>
          <span className="text-[11px] text-slate-400 font-medium text-center max-w-[220px] break-words">
            {file ? file.name : 'Choose CSV file'}
          </span>
        </span>
      </label>
      {file && (
        <button
          onClick={() => onFileSelect(null)}
          className="absolute top-3 right-3 p-1.5 bg-white border border-slate-100 rounded-lg shadow-sm text-slate-400 hover:text-red-500 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
