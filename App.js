import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_LOGS = '@wingo_verified_logs_v1';
const STORAGE_KEY_STATS = '@wingo_stats_v1';

export default function App() {
  const [currentIssue, setCurrentIssue] = useState('--');
  const [nextIssue, setNextIssue] = useState('--');
  const [prediction, setPrediction] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('--');
  const [martingaleLevel, setMartingaleLevel] = useState(1);

  // Smooth Live Round Countdown (WinGo 30S)
  const [roundSecondsLeft, setRoundSecondsLeft] = useState(30);

  // Loss counter (Continuous non-stop play)
  const [consecutiveLosses, setConsecutiveLosses] = useState(0);
  const consecutiveLossesRef = useRef(0);

  // 10,000 Verified History Records FIFO
  const [verifiedLogs, setVerifiedLogs] = useState([]);
  const pendingPredictionRef = useRef(null);
  const historyRef = useRef([]);

  // Stats
  const [stats, setStats] = useState({ total: 0, wins: 0, losses: 0, winRate: '0.0' });

  // 1. Load Stored Data on App Launch
  useEffect(() => {
    loadPersistentData();
  }, []);

  const loadPersistentData = async () => {
    try {
      const savedLogs = await AsyncStorage.getItem(STORAGE_KEY_LOGS);
      const savedStats = await AsyncStorage.getItem(STORAGE_KEY_STATS);

      if (savedLogs) {
        const parsed = JSON.parse(savedLogs);
        setVerifiedLogs(parsed);
      }
      if (savedStats) {
        setStats(JSON.parse(savedStats));
      }
    } catch (err) {
      console.log('Error loading offline storage:', err);
    }
  };

  // 2. Continuous Live Round Countdown (30s cycle)
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

  // 3. Data Fetch Loop
  useEffect(() => {
    fetchLiveWinGoData();
    const interval = setInterval(() => {
      fetchLiveWinGoData();
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  const calculateNextIssueNumber = (issueStr) => {
    if (!issueStr || issueStr === '--') return '--';
    const len = issueStr.length;
    const prefix = issueStr.slice(0, Math.max(0, len - 5));
    const suffix = parseInt(issueStr.slice(-5), 10) + 1;
    return `${prefix}${String(suffix).padStart(5, '0')}`;
  };

  const getNumberColor = (num) => {
    if (num === 0) return { main: 'VIOLET_RED', label: 'V+R', bg: '#ec4899' };
    if (num === 5) return { main: 'VIOLET_GREEN', label: 'V+G', bg: '#8b5cf6' };
    if ([1, 3, 7, 9].includes(num)) return { main: 'GREEN', label: 'GREEN', bg: '#16a34a' };
    return { main: 'RED', label: 'RED', bg: '#dc2626' };
  };

  const checkColorWin = (predictedColor, actualNum) => {
    if (!predictedColor) return false;
    if (predictedColor === 'GREEN') return [1, 3, 5, 7, 9].includes(actualNum);
    if (predictedColor === 'RED') return [0, 2, 4, 6, 8].includes(actualNum);
    return false;
  };

  const derivePredictedNumbers = (bs, color) => {
    if (!bs || !color) return [];
    if (bs === 'BIG' && color === 'GREEN') return [7, 9];
    if (bs === 'BIG' && color === 'RED') return [6, 8];
    if (bs === 'SMALL' && color === 'GREEN') return [1, 3];
    if (bs === 'SMALL' && color === 'RED') return [2, 4];
    return [];
  };

  const fetchLiveWinGoData = async () => {
    try {
      setIsFetching(true);
      const ts = Date.now();
      const res = await fetch(
        `https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?ts=${ts}`
      );
      const json = await res.json();

      if (json?.data?.list?.length > 0) {
        const list = json.data.list;
        const latest = list[0];
        const curIssue = String(latest.issueNumber);
        const actualNum = parseInt(latest.number, 10);
        const actualBS = actualNum >= 5 ? 'BIG' : 'SMALL';
        const actualColorObj = getNumberColor(actualNum);

        let activeLosses = consecutiveLossesRef.current;

        // Verification & Recovery up to Level 5
        if (
          pendingPredictionRef.current &&
          pendingPredictionRef.current.targetIssue === curIssue
        ) {
          const pred = pendingPredictionRef.current;
          const isBsWin = pred.signal === actualBS;
          const isColorWin = checkColorWin(pred.predictedColor, actualNum);
          const isNumWin = Array.isArray(pred.predictedNumbers) && pred.predictedNumbers.includes(actualNum);
          const isWin = isBsWin;

          if (isWin) {
            activeLosses = 0;
            consecutiveLossesRef.current = 0;
            setConsecutiveLosses(0);
            setMartingaleLevel(1);
          } else {
            activeLosses = consecutiveLossesRef.current + 1;
            consecutiveLossesRef.current = activeLosses;
            setConsecutiveLosses(activeLosses);

            // Cycle martingale (1 -> 2 -> 3 -> 4 -> 5 -> 1)
            setMartingaleLevel((prev) => (prev >= 5 ? 1 : prev + 1));
          }

          // FIFO Storage up to 10,000 records
          setVerifiedLogs((prev) => {
            if (prev.some((item) => item.issue === curIssue)) return prev;

            const updatedLogs = [
              {
                issue: curIssue,
                number: actualNum,
                actualBS,
                actualColor: actualColorObj,
                predictedBS: pred.signal,
                predictedColor: pred.predictedColor,
                predictedNumbers: pred.predictedNumbers,
                strategy: pred.strategy,
                isWin,
                isColorWin,
                isNumWin,
                levelUsed: pred.level,
              },
              ...prev,
            ];

            const trimmed = updatedLogs.slice(0, 10000);
            const total = trimmed.length;
            const wins = trimmed.filter((x) => x.isWin).length;
            const losses = total - wins;
            const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
            const newStats = { total, wins, losses, winRate };
            setStats(newStats);

            AsyncStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(trimmed)).catch(() => {});
            AsyncStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(newStats)).catch(() => {});

            return trimmed;
          });

          pendingPredictionRef.current = null;
        }

        setCurrentIssue(curIssue);
        const calculatedNext = calculateNextIssueNumber(curIssue);
        setNextIssue(calculatedNext);

        const incomingData = [...list].reverse().map((item) => {
          const num = parseInt(item.number, 10);
          return {
            issue: String(item.issueNumber),
            num: num,
            bs: num >= 5 ? 'BIG' : 'SMALL',
            color: [1, 3, 7, 9].includes(num) ? 'GREEN' : [2, 4, 6, 8].includes(num) ? 'RED' : num === 5 ? 'GREEN' : 'RED',
          };
        });

        const currentArr = historyRef.current;
        const existingMap = new Map(currentArr.map((i) => [i.issue, i]));
        incomingData.forEach((i) => existingMap.set(i.issue, i));
        const merged = Array.from(existingMap.values()).slice(-10000);
        historyRef.current = merged;

        // Prediction Pipeline with Target Lock check
        const isAlreadyLocked =
          pendingPredictionRef.current &&
          pendingPredictionRef.current.targetIssue === calculatedNext;

        if (!isAlreadyLocked) {
          const nextSignal = calculateAdaptiveAIPrediction(merged, activeLosses);
          setPrediction(nextSignal);

          if (nextSignal) {
            pendingPredictionRef.current = {
              targetIssue: calculatedNext,
              signal: nextSignal.signal,
              predictedColor: nextSignal.predictedColor,
              predictedNumbers: nextSignal.predictedNumbers,
              strategy: nextSignal.strategy,
              level: martingaleLevel,
            };
          }
        }

        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (e) {
      console.log('Sync error:', e);
    } finally {
      setIsFetching(false);
    }
  };

  // --- ENGINE: BS FLIPS ADAPTIVELY | COLOR STAYS DIRECT PATTERN ---
  const calculateAdaptiveAIPrediction = (data, lossCount) => {
    if (!data || data.length < 4) return null;

    // 1. BS PATTERN ENGINE
    const lastResult = data[data.length - 1].bs;
    const seq4 = data.slice(-4).map((d) => d.bs).join('');
    const seq2 = data.slice(-2).map((d) => d.bs).join('');

    let rawPatternSignal = null;
    let baseStrategyName = '';

    const isPairPattern =
      seq4 === 'BIGBIGSMALLSMALL' ||
      seq4 === 'SMALLSMALLBIGBIG' ||
      seq4 === 'SMALLBIGBIGSMALL' ||
      seq4 === 'BIGSMALLSMALLBIG';

    if (isPairPattern) {
      baseStrategyName = 'PAIR PATTERN';
      if (seq2 === 'BIGBIG') rawPatternSignal = 'SMALL';
      else if (seq2 === 'SMALLSMALL') rawPatternSignal = 'BIG';
      else if (seq2.endsWith('BIG')) rawPatternSignal = 'BIG';
      else rawPatternSignal = 'SMALL';
    }

    if (!rawPatternSignal) {
      let streakCount = 1;
      for (let i = data.length - 1; i > 0; i--) {
        if (data[i].bs === data[i - 1].bs) streakCount++;
        else break;
      }

      if (streakCount >= 2) {
        baseStrategyName = `DRAGON (${streakCount}x)`;
        rawPatternSignal = lastResult;
      }
    }

    if (!rawPatternSignal) {
      baseStrategyName = 'MARKOV MATRIX';
      let bCount = 0;
      let sCount = 0;
      for (let i = 0; i < data.length - 2; i++) {
        if (data[i].bs === lastResult) {
          if (data[i + 1].bs === 'BIG') bCount++;
          else sCount++;
        }
      }
      rawPatternSignal = bCount >= sCount ? 'BIG' : 'SMALL';
    }

    // 2. COLOR PATTERN ENGINE (Strict Pattern - No Invert/Flip)
    const lastColor = data[data.length - 1].color;
    const colSeq4 = data.slice(-4).map((d) => d.color).join('');
    const colSeq2 = data.slice(-2).map((d) => d.color).join('');

    let finalColor = null;

    const isColorPairPattern =
      colSeq4 === 'GREENGREENREDRED' ||
      colSeq4 === 'REDREDGREENGREEN' ||
      colSeq4 === 'REDGREENGREENRED' ||
      colSeq4 === 'GREENREDREDGREEN';

    if (isColorPairPattern) {
      if (colSeq2 === 'GREENGREEN') finalColor = 'RED';
      else if (colSeq2 === 'REDRED') finalColor = 'GREEN';
      else if (colSeq2.endsWith('GREEN')) finalColor = 'GREEN';
      else finalColor = 'RED';
    }

    if (!finalColor) {
      let colorStreakCount = 1;
      for (let i = data.length - 1; i > 0; i--) {
        if (data[i].color === data[i - 1].color) colorStreakCount++;
        else break;
      }

      if (colorStreakCount >= 2) {
        finalColor = lastColor;
      }
    }

    if (!finalColor) {
      let gCount = 0;
      let rCount = 0;
      for (let i = 0; i < data.length - 2; i++) {
        if (data[i].color === lastColor) {
          if (data[i + 1].color === 'GREEN') gCount++;
          else rCount++;
        }
      }
      finalColor = gCount >= rCount ? 'GREEN' : 'RED';
    }

    // 3. DYNAMIC SWITCH / FLIP LOGIC ONLY FOR BIG/SMALL
    let finalSignal = rawPatternSignal;
    let finalStrategyLabel = '';

    if (lossCount % 2 === 0) {
      finalSignal = rawPatternSignal === 'BIG' ? 'SMALL' : 'BIG';
      finalStrategyLabel = lossCount === 0
        ? `OPPOSITE TO PATTERN (${baseStrategyName})`
        : `${lossCount}-LOSS: RE-OPPOSITE FLIP (${baseStrategyName})`;
    } else {
      finalSignal = rawPatternSignal;
      finalStrategyLabel = `${lossCount}-LOSS: DIRECT PATTERN (${baseStrategyName})`;
    }

    // 4. NUMBERS PREDICTION (Calculated using flipped BS + Direct Pattern Color)
    const predictedNumbers = derivePredictedNumbers(finalSignal, finalColor);

    return {
      signal: finalSignal,
      predictedColor: finalColor,
      predictedNumbers: predictedNumbers,
      strategy: finalStrategyLabel,
    };
  };

  const getMultiplier = (lvl) => {
    switch (lvl) {
      case 1:
        return '1X';
      case 2:
        return '3X';
      case 3:
        return '8X';
      case 4:
        return '24X';
      case 5:
        return '72X';
      default:
        return '1X';
    }
  };

  const clearAllSavedData = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY_LOGS);
      await AsyncStorage.removeItem(STORAGE_KEY_STATS);
      consecutiveLossesRef.current = 0;
      setConsecutiveLosses(0);
      setMartingaleLevel(1);
      setVerifiedLogs([]);
      setStats({ total: 0, wins: 0, losses: 0, winRate: '0.0' });
    } catch (e) {}
  };

  const renderHeader = () => (
    <View>
      <View style={styles.header}>
        <Text style={styles.appTitle}>WinGo 30S Pro Engine</Text>
        <View style={styles.syncRow}>
          <View style={styles.liveDot} />
          <Text style={styles.syncStatus}>{isFetching ? 'Fetching Data...' : `Synced: ${lastUpdated}`}</Text>
          {isFetching && <ActivityIndicator size="small" color="#2563eb" style={{ marginLeft: 4 }} />}
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

      {/* Dynamic Status Indicator Banner */}
      <View
        style={[
          styles.statusBanner,
          consecutiveLosses === 0
            ? styles.statusOpposite
            : consecutiveLosses % 2 === 1
            ? styles.statusDirect
            : styles.statusReOpposite,
        ]}
      >
        <Text style={styles.statusBannerTitle}>
          {consecutiveLosses === 0 && '🎯 BASE: PREDICTING OPPOSITE TO BS PATTERN'}
          {consecutiveLosses % 2 === 1 && `🔄 ${consecutiveLosses}-LOSS: SWITCHED TO DIRECT BS PATTERN`}
          {consecutiveLosses > 0 && consecutiveLosses % 2 === 0 && `⚡ ${consecutiveLosses}-LOSS: RE-SWITCHED TO OPPOSITE BS`}
        </Text>
        <Text style={styles.statusBannerSub}>
          {consecutiveLosses === 0 && 'Inverting BS pattern (Color remains direct pattern)'}
          {consecutiveLosses % 2 === 1 && 'BS pattern aligned with trend (Color remains direct pattern)'}
          {consecutiveLosses > 0 && consecutiveLosses % 2 === 0 && 'BS returned to opposite (Color remains direct pattern)'}
        </Text>
      </View>

      <View style={styles.predictionCard}>
        <View style={styles.predictionHeaderRow}>
          <Text style={styles.cardHeaderTitle}>PREDICTION FOR {nextIssue}</Text>
          <View style={styles.lockBadge}>
            <Text style={styles.lockBadgeText}>LOCKED</Text>
          </View>
        </View>

        {prediction ? (
          <>
            <View style={styles.predictionDualRow}>
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

              <View style={styles.predBox}>
                <Text style={styles.predBoxLabel}>PREDICTED COLOR (DIRECT)</Text>
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
            </View>

            {/* PREDICTED NUMBERS CHIPS */}
            <View style={styles.numBoxContainer}>
              <Text style={styles.numBoxLabel}>PREDICTED NUMBERS</Text>
              <View style={styles.numChipRow}>
                {prediction.predictedNumbers && prediction.predictedNumbers.length > 0 ? (
                  prediction.predictedNumbers.map((n) => (
                    <View
                      key={n}
                      style={[
                        styles.numCircleBadge,
                        {
                          backgroundColor:
                            prediction.predictedColor === 'GREEN' ? '#16a34a' : '#dc2626',
                        },
                      ]}
                    >
                      <Text style={styles.numCircleText}>{n}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.noNumText}>--</Text>
                )}
              </View>
            </View>

            <View style={styles.strategyBadge}>
              <Text style={styles.strategyText}>Mode: {prediction.strategy}</Text>
            </View>

            <View style={styles.levelCard}>
              <View style={styles.levelItem}>
                <Text style={styles.levelLabel}>RECOVERY STAGE</Text>
                <Text style={styles.levelValue}>Level {martingaleLevel} / 5</Text>
              </View>
              <View style={styles.levelDivider} />
              <View style={styles.levelItem}>
                <Text style={styles.levelLabel}>MULTIPLIER</Text>
                <Text
                  style={[
                    styles.levelValue,
                    {
                      color:
                        martingaleLevel === 1
                          ? '#16a34a'
                          : martingaleLevel <= 3
                          ? '#ea580c'
                          : '#dc2626',
                    },
                  ]}
                >
                  {getMultiplier(martingaleLevel)}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <ActivityIndicator size="small" color="#2563eb" style={{ marginVertical: 20 }} />
        )}
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{stats.total}</Text>
          <Text style={styles.statLabel}>Stored (Max 10K)</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: '#16a34a' }]}>{stats.wins}</Text>
          <Text style={styles.statLabel}>Wins</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: '#dc2626' }]}>{stats.losses}</Text>
          <Text style={styles.statLabel}>Losses</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: '#2563eb' }]}>{stats.winRate}%</Text>
          <Text style={styles.statLabel}>Win Rate</Text>
        </View>
      </View>

      <View style={styles.tableHeaderRow}>
        <Text style={styles.tableSectionTitle}>Verified Predictions ({verifiedLogs.length})</Text>
        <TouchableOpacity onPress={clearAllSavedData}>
          <Text style={styles.clearBadge}>CLEAR DATA</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tableHeader}>
        <Text style={[styles.th, { flex: 1.1 }]}>Period</Text>
        <Text style={[styles.th, { flex: 1.3 }]}>B/S Pred</Text>
        <Text style={[styles.th, { flex: 1.3 }]}>Color Pred</Text>
        <Text style={[styles.th, { flex: 1.3 }]}>Num Pred</Text>
      </View>

      {verifiedLogs.length === 0 && (
        <Text style={styles.noLogsText}>Gathering rounds data...</Text>
      )}
    </View>
  );

  const renderItem = ({ item }) => (
    <View style={styles.tableRow}>
      {/* 1. Period */}
      <Text style={[styles.td, { flex: 1.1, fontWeight: '700', color: '#475569' }]}>
        ..{item.issue ? item.issue.slice(-4) : '--'}
      </Text>

      {/* 2. Big/Small Prediction & Result */}
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
            {item.predictedBS || '--'} · {item.isWin ? 'WIN' : 'LOSE'}
          </Text>
        </View>
      </View>

      {/* 3. Color Prediction & Result */}
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
            {item.predictedColor || '--'} · {item.isColorWin ? 'WIN' : 'LOSE'}
          </Text>
        </View>
      </View>

      {/* 4. Number Prediction & Result */}
      <View style={{ flex: 1.3, alignItems: 'center' }}>
        <View
          style={[
            styles.resultPill,
            { backgroundColor: item.isNumWin ? '#fef08a' : '#f8fafc' },
          ]}
        >
          <Text
            style={[
              styles.resultPillText,
              { color: item.isNumWin ? '#854d0e' : '#64748b' },
            ]}
          >
            {item.predictedNumbers ? item.predictedNumbers.join(',') : '--'} · {item.isNumWin ? 'WIN' : 'LOSE'}
          </Text>
        </View>
      </View>
    </View>
  );

  const renderFooter = () => (
    <TouchableOpacity
      style={styles.refreshBtn}
      onPress={fetchLiveWinGoData}
      activeOpacity={0.8}
    >
      <Text style={styles.refreshText}>Force Refresh Sync</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <FlatList
        data={verifiedLogs}
        keyExtractor={(item, index) => `${item.issue}-${index}`}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={10}
        removeClippedSubviews={true}
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
  statusBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  statusOpposite: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  statusDirect: {
    backgroundColor: '#fefce8',
    borderColor: '#fef08a',
  },
  statusReOpposite: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  statusBannerTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0f172a',
  },
  statusBannerSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
    marginTop: 2,
    textAlign: 'center',
  },
  predictionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
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
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  lockBadgeText: {
    color: '#2563eb',
    fontSize: 9,
    fontWeight: '900',
  },
  predictionDualRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    marginVertical: 10,
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
    fontSize: 32,
    fontWeight: '900',
  },
  colorPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  colorPillText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 13,
  },
  numBoxContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  numBoxLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  numChipRow: {
    flexDirection: 'row',
    gap: 12,
  },
  numCircleBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  numCircleText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  noNumText: {
    color: '#94a3b8',
    fontWeight: '700',
  },
  strategyBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginTop: 6,
  },
  strategyText: {
    color: '#2563eb',
    fontSize: 11,
    fontWeight: '700',
  },
  levelCard: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 14,
    width: '100%',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  levelItem: {
    alignItems: 'center',
  },
  levelLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
  },
  levelValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  levelDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#e2e8f0',
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
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  statLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
    marginTop: 2,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  tableSectionTitle: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  clearBadge: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    fontSize: 9,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
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
    color: '#475569',
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
    fontSize: 11,
    textAlign: 'center',
  },
  resultPill: {
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultPillText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  noLogsText: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    marginVertical: 14,
  },
  refreshBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  refreshText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
});