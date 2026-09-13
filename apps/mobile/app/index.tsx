import { Text, View } from 'react-native';
import { AuthScreen, ResetPassword, useAccount } from '../src/auth';
import { supabase } from '../src/client';
import { Records } from '../src/records';
import { Page, styles } from '../src/ui';
export default function Home() {
  const account = useAccount();
  if (!supabase) return <Page><Text style={styles.kicker}>DEVELOPMENT BUILD</Text><Text style={styles.title}>Your hair,{ '\n' }as you know it.</Text><Text style={styles.subtitle}>A private place for your hair, products, tools and changes over time.</Text><View style={styles.card}><Text style={styles.heading}>Connect your development environment</Text><Text style={styles.body}>The app is ready for its Supabase connection. Set the project URL and public key using the mobile .env.example, then restart Expo.</Text><Text style={styles.body}>No account or record has been created. Use synthetic test data until the release checks are complete.</Text></View></Page>;
  if (account.recovery) return <ResetPassword onComplete={account.finishRecovery}/>;
  if (account.loading) return <Page><Text style={styles.title}>Opening StrandCue…</Text></Page>;
  return account.user ? <Records key={account.user.id} user={account.user} notice={account.notice}/> : <AuthScreen notice={account.notice}/>;
}
