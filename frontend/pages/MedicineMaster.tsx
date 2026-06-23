import React, { useState, useEffect, useRef } from 'react';
import { Card, Input, Select, Button, Table } from '../components/UI';
import { Medicine, MedicineType } from '../types';
import { getMedicines, saveMedicine, deleteMedicine } from '../services/storage';
import { Trash2, Edit2, Upload, FileSpreadsheet, AlertCircle, Download } from 'lucide-react';
import { useMasterData } from '../MasterContext';
import * as XLSX from 'xlsx';

export const MedicineMaster: React.FC = () => {
  const { masterData } = useMasterData();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [form, setForm] = useState<Medicine>({
    id: '',
    name: '',
    type: 'Tablet',
    code: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refreshMedicines();
  }, []);

  const refreshMedicines = async () => {
    const meds = await getMedicines();
    setMedicines(meds);
  };

  const generateCode = (existingCodes?: Set<string>) => {
    let code = '';
    let unique = false;
    let attempts = 0;

    while (!unique && attempts < 50) {
      code = 'MED' + Math.floor(1000 + Math.random() * 9000);
      const exists = existingCodes
        ? existingCodes.has(code)
        : medicines.some(m => m.code === code);

      if (!exists) unique = true;
      attempts++;
    }
    return code;
  };

  const checkCodeExists = (code: string, currentId: string) => {
    return medicines.some(m => m.code === code && m.id !== currentId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const finalCode = form.code.trim() !== '' ? form.code : generateCode();

    if (checkCodeExists(finalCode, form.id)) {
      setError(`Error: The code "${finalCode}" already exists. Please use a unique code.`);
      return;
    }

    const newMed: Medicine = {
      ...form,
      id: isEditing ? form.id : Math.random().toString(),
      code: finalCode
    };
    await saveMedicine(newMed);
    refreshMedicines();
    setSuccessMsg(isEditing ? 'Medicine updated successfully' : 'Medicine added successfully');
    resetForm();

    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const resetForm = () => {
    setForm({ id: '', name: '', type: masterData?.medicineTypes?.[0] || 'Tablet', code: '' });
    setIsEditing(false);
    setError('');
  };

  const handleEdit = (med: Medicine) => {
    setForm(med);
    setIsEditing(true);
    setError('');
    setSuccessMsg('');
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this medicine?')) {
      await deleteMedicine(id);
      refreshMedicines();
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredMeds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMeds.map(m => m.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    if (confirm(`Are you sure you want to delete ${selectedIds.size} medicines?`)) {
      // Perform sequential deletes
      for (const id of selectedIds) {
        await deleteMedicine(id);
      }
      setSelectedIds(new Set());
      refreshMedicines();
      setSuccessMsg(`${selectedIds.size} medicines deleted successfully.`);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  };

  // --- Template Download ---
  const handleDownloadTemplate = () => {
    const headers = ['Medicine Name', 'Medicine Type', 'Code'];
    const rows = [
      ['Paracetamol 650', 'TAB', 'PARA650'],
      ['Cough Syrup', 'SYRP', ''],
      ['Amoxycillin', 'CAP', 'AMOX500']
    ];

    const csvContent = "data:text/csv;charset=utf-8,"
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "medicine_upload_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Excel Import Logic ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setSuccessMsg('');
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      
      // Resolve XLSX library functions (handle Vite default export wrapping)
      const readFn = XLSX.read || (XLSX as any).default?.read;
      const sheetToJsonFn = XLSX.utils?.sheet_to_json || (XLSX as any).default?.utils?.sheet_to_json;
      
      if (!readFn || !sheetToJsonFn) {
        throw new Error("Excel parsing library (SheetJS) is not loaded correctly.");
      }

      const workbook = readFn(data, { type: 'array' });
      if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error("No sheets found in the uploaded file.");
      }

      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = sheetToJsonFn(worksheet);

      if (!jsonData || !Array.isArray(jsonData) || jsonData.length === 0) {
        setError("The uploaded file is empty or invalid.");
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      let addedCount = 0;
      let skippedCount = 0;

      // Get fresh data
      const currentMeds = await getMedicines();
      const currentCodes = new Set(currentMeds.map(m => m.code.toUpperCase()));

      // Local generator using the Set
      const generateImportCode = () => {
        let code = '';
        let attempts = 0;
        let isUnique = false;
        while (!isUnique && attempts < 100) {
          code = 'MED' + Math.floor(1000 + Math.random() * 9000);
          if (!currentCodes.has(code)) {
            isUnique = true;
          }
          attempts++;
        }
        return code;
      };

      const medsToAdd: Medicine[] = [];

      jsonData.forEach((row: any) => {
        if (!row) return;
        // Normalize keys (lowercase) to handle variations
        const normalizedRow: any = {};
        Object.keys(row).forEach(key => {
          if (key) {
            normalizedRow[key.toLowerCase().trim()] = row[key];
          }
        });

        const name = normalizedRow['medicine name'] || normalizedRow['name'];
        const rawType = normalizedRow['medicine type'] || normalizedRow['type'];
        const rawCode = normalizedRow['medicine code'] || normalizedRow['code'];

        if (name && rawType) {
          let type: MedicineType = MedicineType.TAB;
          const upperType = String(rawType).toUpperCase();

          if (upperType.includes('SYRP') || upperType.includes('SYRUP')) type = MedicineType.SYRP;
          else if (upperType.includes('CAP')) type = MedicineType.CAP;
          else if (upperType.includes('INJ')) type = MedicineType.INJ;
          else if (upperType.includes('OINT') || upperType.includes('CREAM') || upperType.includes('GEL')) type = MedicineType.OINT;
          else if (upperType.includes('DROP')) type = MedicineType.DROP;
          else type = MedicineType.TAB;

          let code = rawCode ? String(rawCode).trim() : '';

          // If Code provided, check duplicate
          if (code) {
            if (currentCodes.has(code.toUpperCase())) {
              skippedCount++;
              return; // Skip duplicate provided codes
            }
          } else {
            // Auto generate
            code = generateImportCode();
          }

          // Double safety check
          if (currentCodes.has(code.toUpperCase())) {
            // Try generating again if collision happened in this batch
            code = generateImportCode();
            if (currentCodes.has(code.toUpperCase())) {
              skippedCount++;
              return;
            }
          }

          const newMed: Medicine = {
            id: Math.random().toString(36).substr(2, 9),
            name: String(name).trim(),
            type: type,
            code: code
          };

          medsToAdd.push(newMed);
          currentCodes.add(code.toUpperCase());
          addedCount++;
        } else {
          skippedCount++;
        }
      });

      if (medsToAdd.length > 0) {
        // Run saves sequentially to avoid flooding SQLite with parallel connections
        for (const m of medsToAdd) {
          await saveMedicine(m);
        }

        refreshMedicines();
        setSuccessMsg(`Import Complete: ${addedCount} medicines added. ${skippedCount} skipped (duplicates/errors).`);
      } else {
        setError(`No valid medicines processed. ${skippedCount} rows skipped.`);
      }

    } catch (err) {
      console.error(err);
      setError("Failed to process file. Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredMeds = medicines.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.code.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'ALL' || m.type === filterType;
    return matchesSearch && matchesType;
  });

  const isAllSelected = filteredMeds.length > 0 && selectedIds.size === filteredMeds.length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card title={isEditing ? 'Update Medicine' : 'Add New Medicine'}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Medicine Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Input
                label="Medicine Code (Optional)"
                placeholder="Leave empty for auto-generate"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
              <Select
                label="Type"
                options={(masterData?.medicineTypes || []).map(t => ({ value: t, label: t }))}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              />

              {error && (
                <div className="bg-danger/10 text-danger p-3 rounded-md text-xs flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="bg-green-500/10 text-green-500 p-3 rounded-md text-xs">
                  {successMsg}
                </div>
              )}

              <div className="pt-2 flex gap-2">
                <Button type="submit" className="flex-1">
                  {isEditing ? 'Update' : 'Save'}
                </Button>
                {isEditing && (
                  <Button type="button" variant="ghost" onClick={resetForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <Card title="Bulk Import">
            <div className="space-y-4">
              <p className="text-xs text-text-muted">
                Upload .xlsx or .csv with columns:<br />
                <span className="font-mono text-primary">Medicine Name</span>, <span className="font-mono text-primary">Medicine Type</span>, <span className="font-mono text-primary">Code (Optional)</span>
              </p>

              <div className="flex gap-2 flex-col">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs border border-dashed w-full"
                  onClick={handleDownloadTemplate}
                >
                  <Download size={14} className="mr-2" /> Download Template
                </Button>

                <div className="flex gap-2 mt-2">
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    id="excel-upload"
                  />
                  <label htmlFor="excel-upload" className="flex-1">
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full flex items-center justify-center"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={18} className="mr-2" /> Upload File
                    </Button>
                  </label>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <h2 className="text-xl font-heading font-semibold text-white">Medicine List</h2>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="w-40">
                <Select
                  options={[{ value: 'ALL', label: 'All Types' }, ...(masterData?.medicineTypes || []).map(t => ({ value: t, label: t }))]}
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="py-2"
                />
              </div>
              <Input
                placeholder="Search Name or Code..."
                className="w-full md:w-64"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {/* Bulk Actions - Moved inside the flex container */}
              {selectedIds.size > 0 && (
                <Button
                  variant="secondary"
                  className="bg-danger/10 text-danger hover:bg-danger hover:text-white border-danger/20"
                  onClick={handleBulkDelete}
                >
                  <Trash2 size={16} className="mr-2" /> Delete Selected ({selectedIds.size})
                </Button>
              )}
            </div>
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-text-muted uppercase text-xs font-bold tracking-wider sticky top-0 z-10 backdrop-blur-md">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        className="rounded border-border bg-black checked:bg-primary focus:ring-0 w-4 h-4 cursor-pointer"
                        checked={isAllSelected}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredMeds.map(med => (
                    <tr key={med.id} className={`hover:bg-white/5 transition-colors ${selectedIds.has(med.id) ? 'bg-primary/5' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="rounded border-border bg-black checked:bg-primary focus:ring-0 w-4 h-4 cursor-pointer"
                          checked={selectedIds.has(med.id)}
                          onChange={() => toggleSelect(med.id)}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-muted">{med.code}</td>
                      <td className="px-4 py-3 font-medium">{med.name}</td>
                      <td className="px-4 py-3">
                        <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs">{med.type}</span>
                      </td>
                      <td className="px-4 py-3 flex gap-2">
                        <button onClick={() => handleEdit(med)} className="text-secondary hover:text-blue-400">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(med.id)} className="text-danger hover:text-red-400">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredMeds.length === 0 && (
                    <tr><td colSpan={5} className="p-4 text-center text-text-muted">No medicines found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};