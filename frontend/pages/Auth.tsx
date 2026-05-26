import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { KenpachiLogo } from '../components/ui/Icons';
import { Button, Input, Label } from '../components/ui/ThemeComponents';
import { db } from '../services/db';

const SplitLayout: React.FC<{ children: React.ReactNode, reverse?: boolean }> = ({ children, reverse }) => (
  <div className="min-h-screen flex flex-col md:flex-row bg-primary">
    <div className={`flex-1 flex flex-col items-center justify-center p-12 border-border-strong ${reverse ? 'md:border-l md:order-2' : 'md:border-r'}`}>
      <KenpachiLogo className="w-48 h-48 mb-8 opacity-90" />
      <h1 className="font-display text-6xl md:text-8xl tracking-widest text-center">FEED THE BEAST.</h1>
      <p className="font-mono text-muted mt-4 uppercase tracking-widest text-center">Every warrior tracks their power.</p>
    </div>
    <div className={`flex-1 flex items-center justify-center p-6 md:p-12 bg-surface ${reverse ? 'md:order-1' : ''}`}>
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  </div>
);

export const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock login - check if user exists in local storage
    const user = db.getUser();
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/onboarding');
    }
  };

  return (
    <SplitLayout reverse>
      <h2 className="font-display text-4xl mb-8 tracking-widest">ENTER THE FRAY.</h2>
      <form onSubmit={handleLogin} className="space-y-6">
        <div>
          <Label>Email</Label>
          <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="warrior@seireitei.com" />
        </div>
        <div>
          <Label>Password</Label>
          <Input type="password" required placeholder="••••••••" />
        </div>
        <Button type="submit" className="w-full">UNLEASH</Button>
      </form>
      <div className="mt-8 text-center font-mono text-sm text-muted">
        <p>No account? <Link to="/signup" className="text-white hover:underline">Forge one.</Link></p>
      </div>
    </SplitLayout>
  );
};

export const Signup = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock signup - proceed to onboarding
    navigate('/onboarding', { state: { name } });
  };

  return (
    <SplitLayout>
      <h2 className="font-display text-4xl mb-8 tracking-widest">FORGE YOUR PATH.</h2>
      <form onSubmit={handleSignup} className="space-y-6">
        <div>
          <Label>Display Name</Label>
          <Input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Zaraki" />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" required placeholder="warrior@seireitei.com" />
        </div>
        <div>
          <Label>Password</Label>
          <Input type="password" required placeholder="••••••••" />
        </div>
        <Button type="submit" className="w-full">BEGIN TRAINING</Button>
      </form>
      <div className="mt-8 text-center font-mono text-sm text-muted">
        <p>Already a warrior? <Link to="/login" className="text-white hover:underline">Return.</Link></p>
      </div>
    </SplitLayout>
  );
};
