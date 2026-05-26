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
      let mimeType = imageFile?.type;
      const response = await analyzeFood(
        textInput || undefined, 
        imagePreview || undefined,
        mimeType
      );
      setResult(response);
    } catch (err: any) {
      setError(err.message || "Failed to analyze food. The AI is confused.");
    } finally {
      setIsAnalyzing(false);
    }
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
              <h4 className="font-bold uppercase tracking-widest text-muted border-b border-border-strong pb-2">IDENTIFIED ITEMS</h4>
              {result.food_items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center font-mono text-sm">
                  <div className="flex items-center gap-2">
                    <BellIcon type={item.confidence === 'high' ? 'solid' : item.confidence === 'medium' ? 'half' : 'outline'} />
                    <span>{item.name} ({item.quantity})</span>
                  </div>
                  <span>{item.calories} kcal</span>
                </div>
              ))}
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
