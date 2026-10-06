import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';

const SERVER_IP = '10.154.194.139';
const SERVER_URL = `http://${SERVER_IP}:3000/api/history`;

export default function App() {
  const [currentIssue, setCurrentIssue] = useState('--');
  const [nextIssue, setNextIssue] = useState('--');
  const [prediction, setPrediction] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('--');
  const [roundSecondsLeft, setRoundSecondsLeft] = useState(30);
  const [verifiedLogs, setVerifiedLogs] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    wins: 0,
    losses: 0,
    winRate: '0.0',
    numberWins: 0,
  });

  // 1. Continuous Live Round Countdown (30s cycle)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const sec = now.getSeconds();
      const ms = now.getMilliseconds();
      const cyclePos = (sec % 30) + ms / 1000;
      const left = Math.max(0, Math.ceil(30 - cyclePos));
      setRoundSecondsLeft(left === 0 ? 30 : left);
    }, 250);

    return () => clearInterval(timer);
  }, []);

  // 2. Fetch Data from 24/7 Node.js Background Server
  useEffect(() => {
    fetchServerData();
    const interval = setInterval(() => {
      fetchServerData();
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const calculateNextIssueNumber = (issueStr) => {
    if (!issueStr || issueStr === '--') return '--';
    const len = issueStr.length;
    const prefix = issueStr.slice(0, Math.max(0, len - 5));
    const suffix = parseInt(issueStr.slice(-5), 10) + 1;
    return `${prefix}${String(suffix).padStart(5, '0')}`;
  };

  const fetchServerData = async () => {
    try {
      setIsFetching(true);
      const res = await fetch(SERVER_URL);
      const data = await res.json();

      if (data?.logs?.length > 0) {
        setVerifiedLogs(data.logs);
        setStats(data.stats);

        const latest = data.logs[0];
        setCurrentIssue(latest.issue);
        setNextIssue(calculateNextIssueNumber(latest.issue));

        if (data.activePrediction) {
          setPrediction({
            signal: data.activePrediction.signal,
            predictedColor: data.activePrediction.color,
            predictedNumbers: data.activePrediction.numbers || [data.activePrediction.number],
            strategy: '24/7 SERVER COUNTER-ENGINE',
          });
        }
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (e) {
      console.log('Server connect error:', e.message);
    } finally {
      setIsFetching(false);
    }
  };

  const renderHeader = () => (
    <View>
      <View style={styles.header}>
        <Text style={styles.appTitle}>WinGo 30S Pro Engine</Text>
        <View style={styles.syncRow}>
          <View style={styles.liveDot} />
          <Text style={styles.syncStatus}>
            {isFetching ? 'Syncing Server...' : `Synced: ${lastUpdated}`}
          </Text>
          {isFetching && (
            <ActivityIndicator size="small" color="#2563eb" style={{ marginLeft: 4 }} />
          )}
        </View>
      </View>

      <View style={styles.periodCard}>
        <View style={styles.periodCol}>
          <Text style={styles.periodLabel}>CURRENT ISSUE</Text>
          <Text style={styles.periodVal}>{currentIssue}</Text>
        </View>

        <View style={styles.timerCenterCol}>
          <View style={[styles.timerBadge, roundSecondsLeft <= 5 && styles.timerAlertBadge]}>
            <Text style={[styles.timerText, roundSecondsLeft <= 5 && styles.timerAlertText]}>
              00:{String(roundSecondsLeft).padStart(2, '0')}
            </Text>
          </View>
          <Text style={styles.timerSubLabel}>Rounds 30s</Text>
        </View>

        <View style={styles.periodCol}>
          <Text style={styles.periodLabel}>TARGET NEXT</Text>
          <Text style={[styles.periodVal, { color: '#2563eb' }]}>{nextIssue}</Text>
        </View>
      </View>

      <View style={styles.predictionCard}>
        <View style={styles.predictionHeaderRow}>
          <Text style={styles.cardHeaderTitle}>PREDICTION FOR {nextIssue}</Text>
          <View style={styles.lockBadge}>
            <Text style={styles.lockBadgeText}>24/7 LIVE</Text>
          </View>
        </View>

        {prediction ? (
          <>
            <View style={styles.predictionTrioRow}>
              {/* BS */}
              <View style={styles.predBox}>
                <Text style={styles.predBoxLabel}>BIG / SMALL</Text>
                <Text
                  style={[
                    styles.signalText,
                    {
                      color:
                        prediction.signal === 'BIG'
                          ? '#16a34a'
                          : prediction.signal === 'SMALL'
                          ? '#dc2626'
                          : '#d97706',
                    },
                  ]}
                >
                  {prediction.signal}
                </Text>
              </View>

              {/* Color */}
              <View style={styles.predBox}>
                <Text style={styles.predBoxLabel}>COLOR</Text>
                <View
                  style={[
                    styles.colorPill,
                    {
                      backgroundColor:
                        prediction.predictedColor === 'GREEN'
                          ? '#16a34a'
                          : prediction.predictedColor === 'RED'
                          ? '#dc2626'
                          : '#94a3b8',
                    },
                  ]}
                >
                  <Text style={styles.colorPillText}>{prediction.predictedColor}</Text>
                </View>
              </View>

              {/* 2 Numbers Display */}
              <View style={styles.predBox}>
                <Text style={styles.predBoxLabel}>NUMBERS (9X)</Text>
                <View style={styles.numbersPairRow}>
                  {prediction.predictedNumbers?.map((n, idx) => (
                    <View key={idx} style={styles.numberCircleBadge}>
                      <Text style={styles.numberCircleText}>{n}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.strategyBadge}>
              <Text style={styles.strategyText}>Mode: {prediction.strategy}</Text>
            </View>
          </>
        ) : (
          <ActivityIndicator size="small" color="#2563eb" style={{ marginVertical: 20 }} />
        )}
      </View>

      {/* Stats Card */}
      <View style={styles.statsCard}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{stats.total}</Text>
          <Text style={styles.statLabel}>24/7 Stored</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: '#16a34a' }]}>{stats.wins}</Text>
          <Text style={styles.statLabel}>B/S Wins</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: '#2563eb' }]}>{stats.winRate}%</Text>
          <Text style={styles.statLabel}>Win Rate</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: '#8b5cf6' }]}>{stats.numberWins || 0}</Text>
          <Text style={styles.statLabel}>Num Wins</Text>
        </View>
      </View>

      <View style={styles.tableHeader}>
        <Text style={[styles.th, { flex: 1.2 }]}>Period</Text>
        <Text style={[styles.th, { flex: 1.0 }]}>Actual</Text>
        <Text style={[styles.th, { flex: 1.3 }]}>B/S</Text>
        <Text style={[styles.th, { flex: 1.3 }]}>Color</Text>
        <Text style={[styles.th, { flex: 1.4 }]}>Numbers</Text>
      </View>

      {verifiedLogs.length === 0 && (
        <Text style={styles.noLogsText}>Connecting to server & gathering rounds...</Text>
      )}
    </View>
  );

  const renderItem = ({ item }) => {
    const numsStr = Array.isArray(item.predictedNumbers)
      ? item.predictedNumbers.join(',')
      : item.predictedNumber !== undefined
      ? String(item.predictedNumber)
      : '-';

    return (
      <View style={styles.tableRow}>
        <Text style={[styles.td, { flex: 1.2, fontWeight: '600', color: '#475569' }]}>
          ..{item.issue ? item.issue.slice(-4) : '--'}
        </Text>

        <Text
          style={[
            styles.td,
            {
              flex: 1.0,
              fontWeight: '900',
              color: item.actualBS === 'BIG' ? '#16a34a' : '#dc2626',
            },
          ]}
        >
          {item.number} {item.actualBS ? item.actualBS[0] : ''}
        </Text>

        {/* BS Match */}
        <View style={{ flex: 1.3, alignItems: 'center' }}>
          <View
            style={[
              styles.resultPill,
              { backgroundColor: item.isWin ? '#dcfce7' : '#fee2e2' },
            ]}
          >
            <Text
              style={[
                styles.resultPillText,
                { color: item.isWin ? '#15803d' : '#b91c1c' },
              ]}
            >
              {item.predictedBS ? item.predictedBS[0] : ''} · {item.isWin ? 'WIN' : 'LOSE'}
            </Text>
          </View>
        </View>

        {/* Color Match */}
        <View style={{ flex: 1.3, alignItems: 'center' }}>
          <View
            style={[
              styles.resultPill,
              { backgroundColor: item.isColorWin ? '#dbeafe' : '#f3f4f6' },
            ]}
          >
            <Text
              style={[
                styles.resultPillText,
                { color: item.isColorWin ? '#1d4ed8' : '#6b7280' },
              ]}
            >
              {item.predictedColor ? item.predictedColor[0] : ''} · {item.isColorWin ? 'WIN' : 'LOSE'}
            </Text>
          </View>
        </View>

        {/* 2 Numbers Match */}
        <View style={{ flex: 1.4, alignItems: 'center' }}>
          <View
            style={[
              styles.resultPill,
              {
                backgroundColor: item.isNumberWin ? '#f3e8ff' : '#f1f5f9',
                borderColor: item.isNumberWin ? '#c084fc' : 'transparent',
                borderWidth: item.isNumberWin ? 1 : 0,
              },
            ]}
          >
            <Text
              style={[
                styles.resultPillText,
                { color: item.isNumberWin ? '#7e22ce' : '#94a3b8' },
              ]}
            >
              {numsStr} · {item.isNumberWin ? 'HIT 9X!' : 'MISS'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <FlatList
        data={verifiedLogs}
        keyExtractor={(item, index) => `${item.issue}-${index}`}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    marginRight: 6,
  },
  syncStatus: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  periodCard: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  periodCol: {
    flex: 1,
    alignItems: 'center',
  },
  periodLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 4,
  },
  periodVal: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  timerCenterCol: {
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  timerBadge: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  timerAlertBadge: {
    backgroundColor: '#dc2626',
  },
  timerText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  timerAlertText: {
    color: '#ffffff',
  },
  timerSubLabel: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 3,
  },
  predictionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 3,
    alignItems: 'center',
  },
  predictionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardHeaderTitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  lockBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lockBadgeText: {
    color: '#1d4ed8',
    fontSize: 9,
    fontWeight: '900',
  },
  predictionTrioRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginVertical: 12,
  },
  predBox: {
    alignItems: 'center',
    flex: 1,
  },
  predBoxLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 6,
  },
  signalText: {
    fontSize: 26,
    fontWeight: '900',
  },
  colorPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  colorPillText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 12,
  },
  numbersPairRow: {
    flexDirection: 'row',
    gap: 6,
  },
  numberCircleBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#7e22ce',
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberCircleText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  strategyBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginTop: 4,
  },
  strategyText: {
    color: '#2563eb',
    fontSize: 11,
    fontWeight: '700',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    justifyContent: 'space-between',
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statNum: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  statLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
    marginTop: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  th: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    alignItems: 'center',
  },
  td: {
    fontSize: 12,
    textAlign: 'center',
  },
  resultPill: {
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRadius: 6,
  },
  resultPillText: {
    fontSize: 10,
    fontWeight: '900',
  },
  noLogsText: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    marginVertical: 14,
  },
});