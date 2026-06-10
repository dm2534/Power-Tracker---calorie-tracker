import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Input, Label, Card, SlashDivider } from '../components/ui/ThemeComponents';
import { db } from '../services/db';
import { UserProfile } from '../types';
import { ACTIVITY_MULTIPLIERS } from '../constants';

export const Onboarding = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState(1);
  
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    displayName: location.state?.name || 'Warrior',
    heightCm: 180,
    weightKg: 80,
    targetWeightKg: 80,
    birthDate: '2000-01-01',
    sex: 'M',
    goal: 'maintain',
    dietType: 'none',
    activityLevel: 'moderate',
    proteinPct: 30,
    carbsPct: 40,
    fatPct: 30
  });

  const getAge = (dobString: string) => {
    if (!dobString) return 25;
    const today = new Date();
    const birthDate = new Date(dobString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const calculateCalories = () => {
    const age = getAge(formData.birthDate || '2000-01-01');
    // Mifflin-St Jeor Equation
    let bmr = (10 * formData.weightKg!) + (6.25 * formData.heightCm!) - (5 * age);
    bmr += formData.sex === 'M' ? 5 : -161;
    
    const multiplier = ACTIVITY_MULTIPLIERS[formData.activityLevel as keyof typeof ACTIVITY_MULTIPLIERS];
    let tdee = bmr * multiplier;
    
    if (formData.goal === 'cut') tdee -= 500;
    if (formData.goal === 'bulk') tdee += 500;
    
    return Math.round(tdee);
  };

  const handleComplete = async () => {
    const target = calculateCalories();
    const calculatedAge = getAge(formData.birthDate || '2000-01-01');
    const profile: UserProfile = {
      id: 'user_' + Date.now(),
      ...formData as any,
      age: calculatedAge,
      calorieTarget: target,
      createdAt: new Date().toISOString()
    };
    await db.saveUser(profile);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex justify-between mb-8 font-mono text-muted">
          <span className={step >= 1 ? 'text-white' : ''}>I. VITALS</span>
          <span className={step >= 2 ? 'text-white' : ''}>II. MISSION</span>
          <span className={step >= 3 ? 'text-white' : ''}>III. LIMITS</span>
        </div>
        
        <div className="flex gap-2 mb-12">
          {[1, 2, 3].map(i => (
            <div key={i} className={`h-2 flex-1 transform -skew-x-12 ${step >= i ? 'bg-white' : 'bg-border-strong'}`} />
          ))}
        </div>

        <Card>
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <h2 className="font-display text-5xl tracking-widest mb-6">VITALS.</h2>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label>Height (cm)</Label>
                  <Input type="number" value={formData.heightCm} onChange={e => setFormData({...formData, heightCm: Number(e.target.value)})} />
                </div>
                <div>
                  <Label>Weight (kg)</Label>
                  <Input type="number" value={formData.weightKg} onChange={e => setFormData({...formData, weightKg: Number(e.target.value)})} />
                </div>
                <div>
                  <Label>Target Weight (kg)</Label>
                  <Input type="number" value={formData.targetWeightKg} onChange={e => setFormData({...formData, targetWeightKg: Number(e.target.value)})} />
                </div>
                <div>
                  <Label>Date of Birth</Label>
                  <Input type="date" value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} />
                </div>
                <div className="col-span-2">
                  <Label>Sex</Label>
                  <select 
                    className="w-full bg-surface border-2 border-border-strong text-white px-4 py-3 font-mono focus:border-white focus:outline-none rounded-none appearance-none"
                    value={formData.sex} 
                    onChange={e => setFormData({...formData, sex: e.target.value as 'M'|'F'})}
                  >
                    <option value="M">MALE</option>
                    <option value="F">FEMALE</option>
                  </select>
                </div>
              </div>
              <Button className="w-full mt-8" onClick={() => setStep(2)}>NEXT PHASE</Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              <h2 className="font-display text-5xl tracking-widest mb-6">MISSION.</h2>
              <div>
                <Label>Objective</Label>
                <div className="grid grid-cols-3 gap-4">
                  {['cut', 'maintain', 'bulk'].map(goal => (
                    <button
                      key={goal}
                      onClick={() => setFormData({...formData, goal: goal as any})}
                      className={`py-4 border-2 font-bold uppercase tracking-widest transition-colors ${formData.goal === goal ? 'border-white bg-white text-black' : 'border-border-strong text-muted hover:border-white hover:text-white'}`}
                    >
                      {goal}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-4">
                <Label>Activity Level</Label>
                <select 
                  className="w-full bg-surface border-2 border-border-strong text-white px-4 py-3 font-mono focus:border-white focus:outline-none rounded-none appearance-none"
                  value={formData.activityLevel} 
                  onChange={e => setFormData({...formData, activityLevel: e.target.value as any})}
                >
                  <option value="sedentary">SEDENTARY (Desk job, little exercise)</option>
                  <option value="light">LIGHT (1-3 days/week)</option>
                  <option value="moderate">MODERATE (3-5 days/week)</option>
                  <option value="active">ACTIVE (6-7 days/week)</option>
                  <option value="very_active">VERY ACTIVE (Physical job + training)</option>
                </select>
              </div>
              <div className="pt-4">
                <Label>Diet Type</Label>
                <select 
                  className="w-full bg-surface border-2 border-border-strong text-white px-4 py-3 font-mono focus:border-white focus:outline-none rounded-none appearance-none"
                  value={formData.dietType} 
                  onChange={e => setFormData({...formData, dietType: e.target.value})}
                >
                  <option value="none">NO SPECIFIC DIET</option>
                  <option value="keto">KETOGENIC</option>
                  <option value="vegan">VEGAN</option>
                  <option value="vegetarian">VEGETARIAN</option>
                  <option value="paleo">PALEO</option>
                  <option value="low-carb">LOW CARB</option>
                </select>
              </div>
              <div className="flex gap-4 mt-8">
                <Button variant="ghost" onClick={() => setStep(1)}>BACK</Button>
                <Button className="flex-1" onClick={() => setStep(3)}>CALCULATE POWER</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              <h2 className="font-display text-5xl tracking-widest mb-6">LIMITS.</h2>
              <div className="text-center py-8 border-y border-border-strong mb-6">
                <p className="font-mono text-muted mb-2">CALCULATED DAILY TARGET</p>
                <p className="font-display text-7xl">{calculateCalories()}</p>
                <p className="font-mono text-muted mt-2">KCAL</p>
              </div>
              
              <div>
                <Label>Macro Split (P / C / F)</Label>
                <div className="flex gap-4">
                  <Input type="number" value={formData.proteinPct} onChange={e => setFormData({...formData, proteinPct: Number(e.target.value)})} />
                  <Input type="number" value={formData.carbsPct} onChange={e => setFormData({...formData, carbsPct: Number(e.target.value)})} />
                  <Input type="number" value={formData.fatPct} onChange={e => setFormData({...formData, fatPct: Number(e.target.value)})} />
                </div>
                <p className="font-mono text-xs text-muted mt-2 text-right">
                  Total: {formData.proteinPct! + formData.carbsPct! + formData.fatPct!}%
                </p>
              </div>

              <div className="flex gap-4 mt-8">
                <Button variant="ghost" onClick={() => setStep(2)}>BACK</Button>
                <Button 
                  className="flex-1" 
                  onClick={handleComplete}
                  disabled={formData.proteinPct! + formData.carbsPct! + formData.fatPct! !== 100}
                >
                  ACCEPT LIMITS
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
