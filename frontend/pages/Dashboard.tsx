import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, SlashDivider, TallyBar, Button } from '../components/ui/ThemeComponents';
import { db } from '../services/db';
import { UserProfile, FoodLog } from '../types';
import { Flame, Trash2 } from 'lucide-react';

export const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [todayLogs, setTodayLogs] = useState<FoodLog[]>([]);

  useEffect(() => {
    const load = async () => {
      const localUser = db.getUser();
      if (!localUser) {
        return;
      }
      setUser(localUser);
      const fetchedLogs = await db.fetchLogs(localUser.id);
      setTodayLogs(fetchedLogs.filter((log) => log.loggedAt.startsWith(new Date().toISOString().split('T')[0])));
    };

    load();
  }, []);

  if (!user) return null;

  const totalCalories = todayLogs.reduce((sum, log) => sum + log.calories, 0);
  const totalProtein = todayLogs.reduce((sum, log) => sum + log.proteinG, 0);
  const totalCarbs = todayLogs.reduce((sum, log) => sum + log.carbsG, 0);
  const totalFat = todayLogs.reduce((sum, log) => sum + log.fatG, 0);

  // Calculate macro targets in grams based on percentages
  const proteinTarget = Math.round((user.calorieTarget * (user.proteinPct / 100)) / 4);
  const carbsTarget = Math.round((user.calorieTarget * (user.carbsPct / 100)) / 4);
  const fatTarget = Math.round((user.calorieTarget * (user.fatPct / 100)) / 9);

  const remaining = user.calorieTarget - totalCalories;
  const isOver = remaining < 0;

  const handleDelete = async (id: string) => {
    await db.deleteLog(id);
    if (user) {
      const logs = await db.fetchLogs(user.id);
      setTodayLogs(logs.filter((log) => log.loggedAt.startsWith(new Date().toISOString().split('T')[0])));
    }
  };

  return (
    <div className="p-6 md:p-12 max-w-5xl mx-auto space-y-12">
      
      {/* Header Section */}
      <section className="text-center space-y-4">
        <h2 className="font-mono text-muted tracking-widest uppercase">POWER LEVEL</h2>
        <div className="font-display text-[100px] md:text-[140px] leading-none tracking-tighter">
          {totalCalories} <span className="text-border-strong">/ {user.calorieTarget}</span>
        </div>
        <div className={`font-mono font-bold tracking-widest px-4 py-2 inline-block border-2 ${isOver ? 'border-red-600 text-red-600' : 'border-white text-white'}`}>
          {isOver ? `${Math.abs(remaining)} OVER LIMIT — UNLEASH COMPLETE` : `${remaining} LEFT TO CONSUME`}
        </div>
      </section>

      <SlashDivider />

      {/* Macros Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card>
          <TallyBar current={totalProtein} max={proteinTarget} label="PROTEIN" />
        </Card>
        <Card>
          <TallyBar current={totalCarbs} max={carbsTarget} label="CARBS" />
        </Card>
        <Card>
          <TallyBar current={totalFat} max={fatTarget} label="FAT" />
        </Card>
      </section>

      <Button className="w-full py-6 text-2xl" onClick={() => navigate('/log')}>
        <Flame className="mr-4 w-8 h-8" /> LOG MEAL
      </Button>

      {/* Today's Logs */}
      <section>
        <h3 className="font-display text-4xl mb-6 tracking-widest">TODAY'S CARNAGE.</h3>
        {todayLogs.length === 0 ? (
          <div className="border-2 border-dashed border-border-strong p-12 text-center text-muted font-mono">
            NO MEALS LOGGED YET. CONSUME.
          </div>
        ) : (
          <div className="space-y-4">
            {todayLogs.map(log => (
              <div key={log.id} className="flex items-center justify-between p-4 border border-border-strong bg-surface hover:border-white transition-colors group">
                <div className="flex items-center gap-4">
                  {log.imageUrl ? (
                    <img src={log.imageUrl} alt="food" className="w-16 h-16 object-cover grayscale group-hover:grayscale-0 transition-all" />
                  ) : (
                    <div className="w-16 h-16 bg-elevated flex items-center justify-center font-mono text-xs text-muted">TEXT</div>
                  )}
                  <div>
                    <h4 className="font-bold uppercase tracking-wider">{log.foodName}</h4>
                    <p className="font-mono text-sm text-muted">
                      {log.calories} KCAL | P:{log.proteinG} C:{log.carbsG} F:{log.fatG}
                    </p>
                  </div>
                </div>
                <button onClick={() => handleDelete(log.id)} className="p-4 text-muted hover:text-red-600 transition-colors">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
};
