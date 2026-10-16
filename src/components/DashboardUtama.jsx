import WelcomeBanner from './WelcomeBanner';
import StatCard from './StatCard';
import LineChartCard from './LineChartCard';
import DonutChartCard from './DonutChartCard';
import ZakatFitriProgress from './ZakatFitriProgress';
import ASNDashboard from './ASNDashboard';
import ProgramImpact from './ProgramImpact';
import RecentTransactions from './RecentTransactions';
import QuickMenu from './QuickMenu';
import Announcements from './Announcements';
import { WalletIcon, HandHeartIcon, CoinsIcon, PeopleIcon } from './icons';

export default function DashboardUtama({ currentUser, onNavigate }) {
  return (
    <div className="w-full max-w-[1920px] 2xl:mx-auto space-y-5 sm:space-y-6 md:space-y-8">
      {/* Row 1: Welcome Banner */}
      <WelcomeBanner currentUser={currentUser} />

      {/* Row 2: Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
        <StatCard
          icon={WalletIcon}
          iconBg="#ecfdf5"
          iconColor="#059669"
          label="Total Penerimaan"
          value=""
          rawValue={2_450_000_000_000}
          change="12,5%"
          delay={0}
        />
        <StatCard
          icon={HandHeartIcon}
          iconBg="#eff6ff"
          iconColor="#3b82f6"
          label="Total Penyaluran"
          value=""
          rawValue={1_890_000_000_000}
          change="8,7%"
          delay={100}
        />
        <StatCard
          icon={CoinsIcon}
          iconBg="#fffbeb"
          iconColor="#d97706"
          label="Saldo Dana"
          value=""
          rawValue={560_000_000_000}
          change="5,3%"
          delay={200}
        />
        <StatCard
          icon={PeopleIcon}
          iconBg="#f5f3ff"
          iconColor="#7c3aed"
          label="Total Muzakki"
          value=""
          rawValue={2_345_000}
          change="6,2%"
          delay={300}
        />
        <StatCard
          icon={PeopleIcon}
          iconBg="#f0fdfa"
          iconColor="#14b8a6"
          label="Total Mustahik"
          value=""
          rawValue={5_678_000}
          change="9,1%"
          delay={400}
        />
      </div>

      {/* Row 3: Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4">
        <LineChartCard />
        <DonutChartCard />
      </div>

      {/* Row 4: Insights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <ZakatFitriProgress delay={0} />
        <ASNDashboard delay={100} />
        <ProgramImpact delay={200} />
      </div>

      {/* Row 5: Bottom */}
      <div className="grid grid-cols-1 xl:grid-cols-[7fr_5fr] gap-3 sm:gap-4">
        <div className="relative min-h-0">
          <div className="absolute inset-0">
            <RecentTransactions />
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:gap-4">
          <QuickMenu onNavigate={onNavigate} />
          <Announcements />
        </div>
      </div>
    </div>
  );
}
