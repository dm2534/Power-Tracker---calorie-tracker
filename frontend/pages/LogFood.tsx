import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Input, Label, SlashDivider } from '../components/ui/ThemeComponents';
import { BellIcon, SwordIcon } from '../components/ui/Icons';
import { analyzeFood } from '../services/gemini';
import { db } from '../services/db';
import { GeminiNutritionResponse, FoodLog } from '../types';
import { Upload, Loader2 } from 'lucide-react';

export const LogFood = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'image' | 'text' | 'both'>('image');
  const [textInput, setTextInput] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<GeminiNutritionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!textInput && !imagePreview) return;
    
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const user = db.getUser();
      let mimeType = imageFile?.type;
      const response = await analyzeFood(
        textInput || undefined, 
        imagePreview || undefined,
        mimeType,
        user?.dietType || 'none'
      );
      setResult(response);
    } catch (err: any) {
      setError(err.message || "Failed to analyze food. The AI is confused.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleItemChange = (idx: number, field: string, val: any) => {
    if (!result) return;
    const updatedItems = [...result.food_items];
    let parsedVal = val;
    if (['calories', 'protein_g', 'carbs_g', 'fat_g', 'quantity_grams'].includes(field)) {
      parsedVal = val === '' ? 0 : Number(val);
    }
    updatedItems[idx] = {
      ...updatedItems[idx],
      [field]: parsedVal
    };
    recalculateTotals(updatedItems);
  };

  const handleDeleteItem = (idx: number) => {
    if (!result) return;
    const updatedItems = result.food_items.filter((_, i) => i !== idx);
    recalculateTotals(updatedItems);
  };

  const recalculateTotals = (items: any[]) => {
    if (!result) return;
    const totals = items.reduce((acc, item) => {
      acc.calories += item.calories || 0;
      acc.protein_g += item.protein_g || 0;
      acc.carbs_g += item.carbs_g || 0;
      acc.fat_g += item.fat_g || 0;
      acc.fiber_g += item.fiber_g || 0;
      acc.sugar_g += item.sugar_g || 0;
      return acc;
    }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 });

    setResult({
      ...result,
      food_items: items,
      totals: totals
    });
  };

  const handleSave = async () => {
    if (!result) return;
    
    const user = db.getUser();
    if (!user) return;

    const log: FoodLog = {
      id: 'log_' + Date.now(),
      userId: user.id,
      loggedAt: new Date().toISOString(),
      entryType: mode,
      imageUrl: imagePreview || undefined,
      rawInput: textInput,
      geminiResponse: result,
      calories: result.totals.calories,
      proteinG: result.totals.protein_g,
      carbsG: result.totals.carbs_g,
      fatG: result.totals.fat_g,
      foodName: result.food_items.map(i => i.name).join(', ')
    };

    await db.addLog(log);
    navigate('/dashboard');
  };

  return (
    <div className="p-6 md:p-12 max-w-4xl mx-auto space-y-8">
      <h2 className="font-display text-6xl tracking-widest">CONSUME.</h2>
      
      {/* Mode Selector */}
      <div className="flex border-2 border-border-strong">
        {(['image', 'text', 'both'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-4 font-bold uppercase tracking-widest transition-colors ${mode === m ? 'bg-white text-black' : 'bg-surface text-muted hover:text-white'}`}
          >
            [ {m} ]
          </button>
        ))}
      </div>

      {/* Input Area */}
      <Card className="space-y-6">
        {(mode === 'image' || mode === 'both') && (
          <div 
            className="border-2 border-dashed border-border-strong p-12 flex flex-col items-center justify-center cursor-pointer hover:border-white transition-colors relative overflow-hidden min-h-[300px]"
            onClick={() => fileInputRef.current?.click()}
          >
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageChange} />
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-50 grayscale" />
            ) : (
              <>
                <SwordIcon className="w-16 h-16 mb-4 text-muted" />
                <p className="font-mono text-muted uppercase tracking-widest">Drop image or click to capture</p>
              </>
            )}
          </div>
        )}

        {(mode === 'text' || mode === 'both') && (
          <div>
            <Label>Description</Label>
            <textarea 
              className="w-full bg-surface border-2 border-border-strong text-white p-4 font-mono focus:border-white focus:outline-none rounded-none min-h-[150px] resize-none"
              placeholder="DESCRIBE YOUR MEAL, WARRIOR... (e.g., 2 scrambled eggs and a slice of toast)"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
            />
          </div>
        )}

        <Button 
          className="w-full py-4" 
          onClick={handleAnalyze}
          disabled={isAnalyzing || (!textInput && !imagePreview)}
        >
          {isAnalyzing ? (
            <span className="flex items-center gap-2"><Loader2 className="animate-spin" /> ANALYZING...</span>
          ) : 'ANALYZE'}
        </Button>
        
        {error && (
          <div className="p-4 border-2 border-red-600 text-red-600 font-mono text-sm uppercase">
            ERROR: {error}
          </div>
        )}
      </Card>

      {/* Results Area */}
      {result && (
        <div className="animate-fade-in space-y-8">
          <SlashDivider />
          
          {result.overall_confidence === 'low' && (
            <div className="bg-red-900/20 border-2 border-red-600 p-4 text-red-500 font-bold tracking-widest flex items-center gap-4">
              <BellIcon type="outline" className="w-6 h-6 text-red-500" />
              UNCERTAIN READING — WARRIOR, VERIFY YOUR DATA
            </div>
          )}

          <Card>
            <h3 className="font-display text-4xl mb-6 tracking-widest">ANALYSIS COMPLETE.</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="border border-border-strong p-4 text-center">
                <p className="font-mono text-muted text-xs mb-1">CALORIES</p>
                <p className="font-display text-4xl">{result.totals.calories}</p>
              </div>
              <div className="border border-border-strong p-4 text-center">
                <p className="font-mono text-muted text-xs mb-1">PROTEIN</p>
                <p className="font-display text-4xl">{result.totals.protein_g}g</p>
              </div>
              <div className="border border-border-strong p-4 text-center">
                <p className="font-mono text-muted text-xs mb-1">CARBS</p>
                <p className="font-display text-4xl">{result.totals.carbs_g}g</p>
              </div>
              <div className="border border-border-strong p-4 text-center">
                <p className="font-mono text-muted text-xs mb-1">FAT</p>
                <p className="font-display text-4xl">{result.totals.fat_g}g</p>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <h4 className="font-bold uppercase tracking-widest text-muted border-b border-border-strong pb-2">IDENTIFIED ITEMS (CLICK TEXT OR MACROS TO EDIT)</h4>
              {result.food_items.map((item, idx) => (
                <div key={idx} className="border border-border-strong p-4 bg-surface space-y-3 relative group hover:border-white transition-colors">
                  <div className="flex gap-4 items-center justify-between">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={item.name}
                        onChange={e => handleItemChange(idx, 'name', e.target.value)}
                        className="bg-transparent border-b border-transparent hover:border-border-strong focus:border-white focus:outline-none font-bold uppercase tracking-wider text-white w-full"
                      />
                    </div>
                    <div className="w-24">
                      <input
                        type="text"
                        value={item.quantity}
                        onChange={e => handleItemChange(idx, 'quantity', e.target.value)}
                        className="bg-transparent border-b border-transparent hover:border-border-strong focus:border-white focus:outline-none font-mono text-muted text-sm text-right w-full"
                        placeholder="portion"
                      />
                    </div>
                    <button
                      onClick={() => handleDeleteItem(idx)}
                      className="text-muted hover:text-red-600 transition-colors px-2 text-xl font-bold"
                      title="Delete item"
                    >
                      &times;
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2 font-mono text-xs">
                    <div>
                      <span className="text-muted block text-[10px] uppercase">KCAL</span>
                      <input
                        type="number"
                        value={item.calories}
                        onChange={e => handleItemChange(idx, 'calories', e.target.value)}
                        className="bg-elevated border border-border-strong focus:border-white focus:outline-none px-2 py-1 text-white w-full"
                      />
                    </div>
                    <div>
                      <span className="text-muted block text-[10px] uppercase">PRO (g)</span>
                      <input
                        type="number"
                        value={item.protein_g}
                        onChange={e => handleItemChange(idx, 'protein_g', e.target.value)}
                        className="bg-elevated border border-border-strong focus:border-white focus:outline-none px-2 py-1 text-white w-full"
                      />
                    </div>
                    <div>
                      <span className="text-muted block text-[10px] uppercase">CARB (g)</span>
                      <input
                        type="number"
                        value={item.carbs_g}
                        onChange={e => handleItemChange(idx, 'carbs_g', e.target.value)}
                        className="bg-elevated border border-border-strong focus:border-white focus:outline-none px-2 py-1 text-white w-full"
                      />
                    </div>
                    <div>
                      <span className="text-muted block text-[10px] uppercase">FAT (g)</span>
                      <input
                        type="number"
                        value={item.fat_g}
                        onChange={e => handleItemChange(idx, 'fat_g', e.target.value)}
                        className="bg-elevated border border-border-strong focus:border-white focus:outline-none px-2 py-1 text-white w-full"
                      />
                    </div>
                  </div>
                </div>
              ))}
              {result.food_items.length === 0 && (
                <div className="text-center font-mono text-muted py-8 border border-dashed border-border-strong">
                  ALL ITEMS REMOVED. MEAL EMPTY.
                </div>
              )}
            </div>

            <div className="bg-surface p-4 border border-border-strong font-mono text-xs text-muted mb-8">
              <p className="uppercase font-bold text-white mb-2">AI REASONING:</p>
              <p>{result.reasoning}</p>
            </div>

            <Button className="w-full py-4" onClick={handleSave}>LOG THIS MEAL</Button>
          </Card>
        </div>
      )}
    </div>
  );
};
