import React, { useState, useEffect } from 'react';
import { Card, SlashDivider } from '../components/ui/ThemeComponents';
import { db } from '../services/db';
import { FoodLog } from '../types';

export const History = () => {
  const [logs, setLogs] = useState<FoodLog[]>([]);

  useEffect(() => {
    setLogs(db.getLogs());
  }, []);

  // Group logs by date
  const groupedLogs = logs.reduce((acc, log) => {
    const date = log.loggedAt.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(log);
    return acc;
  }, {} as Record<string, FoodLog[]>);

  const sortedDates = Object.keys(groupedLogs).sort((a, b) => b.localeCompare(a));

  return (
    <div className="p-6 md:p-12 max-w-4xl mx-auto space-y-8">
      <h2 className="font-display text-6xl tracking-widest">THE FALLEN.</h2>
      <p className="font-mono text-muted uppercase tracking-widest">A record of your consumption.</p>
      
      <SlashDivider />

      <div className="space-y-12">
        {sortedDates.length === 0 ? (
          <div className="text-center font-mono text-muted py-12">NO HISTORY FOUND.</div>
        ) : (
          sortedDates.map(date => {
            const dayLogs = groupedLogs[date];
            const dayTotal = dayLogs.reduce((sum, l) => sum + l.calories, 0);
            
            return (
              <div key={date} className="space-y-4">
                <div className="flex justify-between items-end border-b-2 border-white pb-2">
                  <h3 className="font-display text-3xl tracking-widest">{new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}</h3>
                  <span className="font-mono font-bold">{dayTotal} KCAL</span>
                </div>
                
                <div className="grid gap-4">
                  {dayLogs.map(log => (
                    <Card key={log.id} className="flex flex-col md:flex-row gap-6">
                      {log.imageUrl && (
                        <div className="w-full md:w-48 h-32 flex-shrink-0">
                          <img src={log.imageUrl} alt="meal" className="w-full h-full object-cover grayscale" />
                        </div>
                      )}
                      <div className="flex-1 space-y-4">
                        <div className="flex justify-between items-start">
                          <h4 className="font-bold uppercase tracking-wider text-xl">{log.foodName}</h4>
                          <span className="font-display text-2xl">{log.calories}</span>
                        </div>
                        
                        <div className="flex gap-4 font-mono text-sm text-muted">
                          <span>PRO: {log.proteinG}g</span>
                          <span>CARB: {log.carbsG}g</span>
                          <span>FAT: {log.fatG}g</span>
                        </div>
                        
                        {log.rawInput && (
                          <p className="font-mono text-xs text-muted italic border-l-2 border-border-strong pl-2">
                            "{log.rawInput}"
                          </p>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
