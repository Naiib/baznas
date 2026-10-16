import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Bot, 
  ArrowLeft, 
  Cpu, 
  ScanLine, 
  Sparkles, 
  CheckSquare
} from 'lucide-react';

export default function AIDataEntryPage({ onNavigate = () => {} }) {
  return (
    <div className="w-full max-w-[1920px] 2xl:mx-auto min-h-[70vh] flex flex-col items-center justify-center p-4 relative">
      
      {/* Glow Effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-60 h-60 rounded-full bg-blue-500/5 blur-[80px] pointer-events-none" />

      {/* Main Container Card */}
      <Card className="w-full max-w-xl shadow-2xl border border-border/80 bg-card/65 backdrop-blur-md rounded-2xl overflow-hidden animate-page-enter">
        <CardContent className="p-8 flex flex-col items-center text-center space-y-6">
          
          {/* Animated AI Icon Container */}
          <div className="relative flex items-center justify-center size-20 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-inner mb-2 animate-bounce-slow">
            <Bot className="size-10 animate-pulse" />
            <div className="absolute -top-1 -right-1 size-3.5 rounded-full bg-emerald-500 border-2 border-card animate-ping" />
            <div className="absolute -top-1 -right-1 size-3.5 rounded-full bg-emerald-500 border-2 border-card" />
          </div>

          {/* Heading */}
          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight flex items-center justify-center gap-2">
              <Sparkles className="size-5 text-amber-500 animate-spin-slow" />
              AI Assistant Data Entry
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
              Fitur penginputan data cerdas otomatis menggunakan model kecerdasan buatan terpadu untuk efisiensi amil BAZNAS.
            </p>
          </div>

          {/* Development Status Indicator */}
          <div className="w-full bg-muted/65 p-4 rounded-xl border border-border/60 text-left space-y-2.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
                <Cpu className="size-3.5 animate-spin" /> Sedang Dikembangkan
              </span>
              <span className="font-bold text-muted-foreground">70% Selesai</span>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full h-2 bg-border rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full animate-pulse" 
                style={{ width: '70%' }}
              />
            </div>
          </div>

          {/* Upcoming Features Checklist */}
          <div className="w-full space-y-3 text-left">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider pl-1">Fitur yang Akan Datang:</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 bg-card hover:bg-muted/30 transition-colors">
                <ScanLine className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-foreground">OCR Bukti Setoran</h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Scan otomatis kwitansi & mutasi bank tanpa ketik manual.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 bg-card hover:bg-muted/30 transition-colors">
                <Bot className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-foreground">Autofill Form Cerdas</h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Isi form pendaftaran Muzakki & Mustahik otomatis via AI.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 bg-card hover:bg-muted/30 transition-colors">
                <CheckSquare className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-foreground">Audit Kepatuhan</h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Deteksi dini ketidaksesuaian nominal asnaf zakat secara instan.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 bg-card hover:bg-muted/30 transition-colors">
                <Sparkles className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-foreground">Asisten AI Chatbot</h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Ambil insight rekapitulasi data BAZNAS lewat obrolan teks.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 w-full flex justify-center border-t border-border/60">
            <Button 
              onClick={() => onNavigate('utama')}
              variant="outline" 
              className="text-xs h-9 px-5 gap-1.5 border-border hover:bg-muted font-semibold"
            >
              <ArrowLeft className="size-3.5" /> Kembali ke Dashboard
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
