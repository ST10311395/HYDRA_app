import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/** True while the device reports connectivity (null/unknown treated as online to avoid false alarms). */
export function useNetwork(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false)), []);
  return online;
}
