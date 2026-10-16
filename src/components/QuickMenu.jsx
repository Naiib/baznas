import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PeopleIcon, TargetIcon } from './icons';

const items = [
  { icon: PeopleIcon, label: 'Tambah\nMustahik', color: '#3b82f6', bg: '#eff6ff', desc: 'Daftarkan mustahik', page: 'mustahik' },
  { icon: TargetIcon, label: 'Tambah\nProgram', color: '#7c3aed', bg: '#f5f3ff', desc: 'Buat program bantuan', page: 'program_bantuan' },
  { icon: Bot, label: 'AI Data\nEntry', color: '#7c3aed', bg: '#f5f3ff', desc: 'Entri otomatis dengan AI', page: 'ai_entry' },
];

export default function QuickMenu({ onNavigate }) {
  return (
    <Card className="card-spotlight group shadow-card transition-all-smooth hover:shadow-card-hover animate-fade-in-up gap-0 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs sm:text-sm font-semibold">Menu Cepat</CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={200}>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {items.map((item, idx) => {
              const Icon = item.icon;
              const button = (
                <Button 
                  key={idx} 
                  variant="outline" 
                  onClick={() => item.page && onNavigate && onNavigate(item.page)}
                  className="group/btn relative flex flex-col items-center gap-1.5 sm:gap-2 h-auto py-2 sm:py-3 px-1.5 sm:px-2 rounded-xl sm:rounded-2xl border-border hover:border-transparent hover:shadow-md active:scale-[0.97] transition-all duration-300 bg-card overflow-hidden animate-fade-in-up cursor-pointer"
                  style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}>
                  <div className="absolute inset-0 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"
                    style={{ background: `linear-gradient(135deg, ${item.bg} 0%, white 100%)` }} />
                  <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center transition-all duration-300 group-hover/btn:scale-110 group-hover/btn:rotate-6 group-hover/btn:shadow-lg"
                    style={{ backgroundColor: item.bg, color: item.color }}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="relative text-[10px] sm:text-xs font-semibold text-foreground leading-tight whitespace-pre-line text-center">{item.label}</span>
                </Button>
              );
              return (
                <Tooltip key={idx}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">{item.desc}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
