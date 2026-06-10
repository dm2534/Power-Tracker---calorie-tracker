import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Input, Label, SlashDivider } from '../components/ui/ThemeComponents';
import { db } from '../services/db';
import { UserProfile } from '../types';

export const Profile = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  useEffect(() => {
    setUser(db.getUser());
  }, []);

  if (!user) return null;

  const handleLogout = () => {
    // In a real app, call Supabase signOut
    navigate('/login');
  };

  const handleDelete = () => {
    if (deleteConfirm === 'BANKAI') {
      db.clearUser();
      navigate('/login');
    }
  };

  return (
    <div className="p-6 md:p-12 max-w-3xl mx-auto space-y-8">
      <h2 className="font-display text-6xl tracking-widest">VITALS.</h2>
      
      <Card className="space-y-6">
        <div className="flex justify-between items-center border-b border-border-strong pb-4">
          <div>
            <p className="font-mono text-muted text-sm uppercase">Warrior Designation</p>
            <p className="font-display text-4xl">{user.displayName}</p>
          </div>
          <Button variant="ghost" onClick={handleLogout}>LOGOUT</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <Label>Height</Label>
            <p className="font-mono text-xl">{user.heightCm} cm</p>
          </div>
          <div>
            <Label>Weight</Label>
            <p className="font-mono text-xl">{user.weightKg} kg</p>
          </div>
          <div>
            <Label>Target Weight</Label>
            <p className="font-mono text-xl">{user.targetWeightKg || user.weightKg} kg</p>
          </div>
          <div>
            <Label>Age (DOB)</Label>
            <p className="font-mono text-xl">{user.age} yrs ({user.birthDate || 'N/A'})</p>
          </div>
          <div>
            <Label>Target</Label>
            <p className="font-mono text-xl">{user.calorieTarget} kcal</p>
          </div>
          <div>
            <Label>Objective</Label>
            <p className="font-mono text-xl uppercase">{user.goal}</p>
          </div>
          <div>
            <Label>Diet Type</Label>
            <p className="font-mono text-xl uppercase">{user.dietType || 'none'}</p>
          </div>
          <div>
            <Label>Activity Level</Label>
            <p className="font-mono text-xl uppercase">{user.activityLevel?.replace('_', ' ') || 'moderate'}</p>
          </div>
        </div>
      </Card>

      <SlashDivider />

      <section className="space-y-4">
        <h3 className="font-display text-3xl text-red-600 tracking-widest">DANGER ZONE.</h3>
        <Card className="border-red-900 bg-red-950/10">
          <p className="font-mono text-sm text-muted mb-4">
            To obliterate your existence from the records, type <span className="text-white font-bold">BANKAI</span> below.
          </p>
          <div className="flex gap-4">
            <Input 
              value={deleteConfirm} 
              onChange={e => setDeleteConfirm(e.target.value)} 
              placeholder="BANKAI" 
              className="border-red-900 focus:border-red-600"
            />
            <Button 
              variant="danger" 
              disabled={deleteConfirm !== 'BANKAI'}
              onClick={handleDelete}
            >
              OBLITERATE
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
};
