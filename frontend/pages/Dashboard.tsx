import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, SlashDivider, TallyBar, Button } from '../components/ui/ThemeComponents';
import { db } from '../services/db';
import { UserProfile, FoodLog, DailyActivity } from '../types';
import { Flame, Trash2, Droplet, Dumbbell, Footprints, Plus } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [todayLogs, setTodayLogs] = useState<FoodLog[]>([]);
  const [allLogs, setAllLogs] = useState<FoodLog[]>([]);
  const [activity, setActivity] = useState<DailyActivity>({
    userId: '',
    logDate: '',
    caloriesBurnt: 0,
    waterIngestedMl: 0,
    steps: 0
  });
  const [allActivities, setAllActivities] = useState<DailyActivity[]>([]);

  // Manual input values
  const [manualWater, setManualWater] = useState('');
  const [manualBurn, setManualBurn] = useState('');
  const [manualSteps, setManualSteps] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];

  const loadData = async (userId: string) => {
    const fetchedLogs = await db.fetchLogs(userId);
    setAllLogs(fetchedLogs);
    setTodayLogs(fetchedLogs.filter((log) => log.loggedAt.startsWith(todayStr)));

    // Fetch activity for today
    try {
      const todayAct = await db.fetchActivity(userId, todayStr);
      setActivity(todayAct);
    } catch {
      setActivity({
        userId,
        logDate: todayStr,
        caloriesBurnt: 0,
        waterIngestedMl: 0,
        steps: 0
      });
    }

    // Fetch all activities for graphs
    const allActs = await db.fetchAllActivities(userId);
    setAllActivities(allActs);
  };

  useEffect(() => {
    const load = async () => {
      const localUser = db.getUser();
      if (!localUser) return;
      setUser(localUser);
      await loadData(localUser.id);
    };
    load();
  }, []);

  if (!user) return null;

  const totalCalories = todayLogs.reduce((sum, log) => sum + log.calories, 0);
  const totalProtein = todayLogs.reduce((sum, log) => sum + log.proteinG, 0);
  const totalCarbs = todayLogs.reduce((sum, log) => sum + log.carbsG, 0);
  const totalFat = todayLogs.reduce((sum, log) => sum + log.fatG, 0);

  const netCalories = totalCalories - activity.caloriesBurnt;
  const remainingNet = user.calorieTarget - netCalories;
  const isOver = remainingNet < 0;

  // Calculate macro targets in grams based on percentages
  const proteinTarget = Math.round((user.calorieTarget * (user.proteinPct / 100)) / 4);
  const carbsTarget = Math.round((user.calorieTarget * (user.carbsPct / 100)) / 4);
  const fatTarget = Math.round((user.calorieTarget * (user.fatPct / 100)) / 9);

  const handleDelete = async (id: string) => {
    await db.deleteLog(id);
    if (user) {
      await loadData(user.id);
    }
  };

  // Quick logging helpers
  const updateActivityMetric = async (updates: Partial<DailyActivity>) => {
    const updatedActivity = {
      ...activity,
      ...updates,
      userId: user.id,
      logDate: todayStr
    };
    const saved = await db.saveActivity(updatedActivity);
    setActivity(saved);
    
    // Refresh all activities for graph
    const allActs = await db.fetchAllActivities(user.id);
    setAllActivities(allActs);
  };

  const addWater = (amount: number) => {
    updateActivityMetric({ waterIngestedMl: (activity.waterIngestedMl || 0) + amount });
  };

  const addBurn = (amount: number) => {
    updateActivityMetric({ caloriesBurnt: (activity.caloriesBurnt || 0) + amount });
  };

  const addSteps = (amount: number) => {
    updateActivityMetric({ steps: (activity.steps || 0) + amount });
  };

  // Generate last 7 days chart data
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  const chartData = last7Days.map(date => {
    const dayLogs = allLogs.filter(log => log.loggedAt.startsWith(date));
    const dayActivity = allActivities.find(act => act.logDate === date);
    
    const consumed = dayLogs.reduce((sum, log) => sum + log.calories, 0);
    const burnt = dayActivity ? dayActivity.caloriesBurnt : 0;
    
    const formattedDate = new Date(date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }).toUpperCase();

    return {
      date: formattedDate,
      CONSUMED: consumed,
      BURNT: burnt,
      TARGET: user.calorieTarget
    };
  });

  return (
    <div className="p-6 md:p-12 max-w-5xl mx-auto space-y-12">
      
      {/* Header Section */}
      <section className="text-center space-y-4">
        <h2 className="font-mono text-muted tracking-widest uppercase">NET POWER LEVEL</h2>
        <div className="font-display text-[80px] md:text-[120px] leading-none tracking-tighter">
          {netCalories} <span className="text-border-strong">/ {user.calorieTarget}</span>
        </div>
        <p className="font-mono text-xs text-muted uppercase">
          (Consumed: {totalCalories} kcal | Active Burn: {activity.caloriesBurnt} kcal)
        </p>
        <div className={`font-mono font-bold tracking-widest px-4 py-2 inline-block border-2 ${isOver ? 'border-red-600 text-red-600' : 'border-white text-white'}`}>
          {isOver ? `${Math.abs(remainingNet)} OVER LIMIT — DEFICIT BROKEN` : `${remainingNet} NET KCAL LEFT TO CONSUME`}
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

      {/* Daily Metrics Logs (Hydration, Steps, Active Burn) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Hydration Card */}
        <Card className="space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <h4 className="font-display text-2xl tracking-wider flex items-center gap-2">
              <Droplet className="w-6 h-6 text-blue-400" /> HYDRATION
            </h4>
            <p className="font-mono text-xl">{activity.waterIngestedMl || 0} / 2500 ml</p>
          </div>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1 py-2 text-xs" onClick={() => addWater(250)}>+250ml</Button>
              <Button variant="ghost" className="flex-1 py-2 text-xs" onClick={() => addWater(500)}>+500ml</Button>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Custom ml"
                value={manualWater}
                onChange={e => setManualWater(e.target.value)}
                className="w-full bg-elevated border border-border-strong px-2 py-1 font-mono text-sm text-white focus:outline-none"
              />
              <Button variant="ghost" className="py-1 px-3" onClick={() => { addWater(Number(manualWater) || 0); setManualWater(''); }}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Active Burn Card */}
        <Card className="space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <h4 className="font-display text-2xl tracking-wider flex items-center gap-2">
              <Dumbbell className="w-6 h-6 text-red-500" /> ACTIVE BURN
            </h4>
            <p className="font-mono text-xl">{activity.caloriesBurnt || 0} kcal</p>
          </div>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1 py-2 text-xs" onClick={() => addBurn(100)}>+100 kcal</Button>
              <Button variant="ghost" className="flex-1 py-2 text-xs" onClick={() => addBurn(250)}>+250 kcal</Button>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Custom kcal"
                value={manualBurn}
                onChange={e => setManualBurn(e.target.value)}
                className="w-full bg-elevated border border-border-strong px-2 py-1 font-mono text-sm text-white focus:outline-none"
              />
              <Button variant="ghost" className="py-1 px-3" onClick={() => { addBurn(Number(manualBurn) || 0); setManualBurn(''); }}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Steps Card */}
        <Card className="space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <h4 className="font-display text-2xl tracking-wider flex items-center gap-2">
              <Footprints className="w-6 h-6 text-green-400" /> STEPS
            </h4>
            <p className="font-mono text-xl">{activity.steps || 0} / 10000 steps</p>
          </div>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1 py-2 text-xs" onClick={() => addSteps(1000)}>+1k steps</Button>
              <Button variant="ghost" className="flex-1 py-2 text-xs" onClick={() => addSteps(5000)}>+5k steps</Button>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Custom steps"
                value={manualSteps}
                onChange={e => setManualSteps(e.target.value)}
                className="w-full bg-elevated border border-border-strong px-2 py-1 font-mono text-sm text-white focus:outline-none"
              />
              <Button variant="ghost" className="py-1 px-3" onClick={() => { addSteps(Number(manualSteps) || 0); setManualSteps(''); }}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      </section>

      {/* Weekly History Recharts Visualization */}
      <section>
        <Card className="space-y-6">
          <h3 className="font-display text-3xl tracking-widest">WEEKLY POWER METRICS</h3>
          <div className="h-[300px] w-full font-mono text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="date" stroke="#888" tickLine={false} />
                <YAxis stroke="#888" tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111', borderColor: '#444', color: '#fff' }}
                  labelStyle={{ fontWeight: 'bold' }}
                />
                <Legend />
                <Bar dataKey="CONSUMED" fill="#ffffff" />
                <Bar dataKey="BURNT" fill="#444444" />
                <Line type="monotone" dataKey="TARGET" stroke="#ef4444" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

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
