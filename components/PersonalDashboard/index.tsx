"use client";

import { useAppUser, useAppEnvironment } from "@/contexts/unified-app-context";
import { useFitnessStreaks } from "@/hooks/use-fitness-streaks";
import { NetworkData } from "@/lib/blockchain";
import { formatNumber } from "@/lib/utils";
import { useNotification } from "@coinbase/onchainkit/minikit";
import Image from "next/image";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import TargetsAndStreaks from "@/components/TargetsAndStreaks";
import Confetti from "@/components/Confetti";
import { toast } from "react-hot-toast";
import { FaShare, FaArrowRight, FaFire, FaMedal } from "react-icons/fa";
import UserPredictionStats from "./UserPredictionStats";

// Simple conditional rendering component
const WebAppOnly = ({ children }: { children: React.ReactNode }) => {
  const { mode } = useAppEnvironment();
  return mode === "webapp" ? <>{children}</> : null;
};

interface PersonalDashboardProps {
  networkData: NetworkData;
  isLoading: boolean;
}

interface UserStats {
  totalPushups: number;
  totalSquats: number;
  networkBreakdown: {
    [network: string]: {
      pushups: number;
      squats: number;
    };
  };
  predictions: {
    total: number;
    correct: number;
    pending: number;
    staked: number;
  };
  rank: {
    pushups: number;
    squats: number;
    overall: number;
  };
}

export default function PersonalDashboard({
  networkData,
  isLoading,
}: PersonalDashboardProps) {
  // Use simple user management
  const {
    user,
    isFarcasterUser,
    isWalletUser,
    isAuthenticated,
    isLoading: authLoading,
    getFid,
  } = useAppUser();

  // Only use fitness streaks for Farcaster users (requires persistent identity)
  const {
    streakData,
    isLoading: streaksLoading,
    refreshStreaks,
    syncFitnessData,
  } = useFitnessStreaks();
  // Use useMemo to prevent unnecessary rerenders when setting userStats
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  // Use a ref to track if we've already calculated stats to prevent multiple calculations
  const statsCalculatedRef = useRef<boolean>(false);
  const [shareableImage, setShareableImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showTargetsAndStreaks, setShowTargetsAndStreaks] = useState(false);
  const sendNotification = useNotification();

  // Debug logging for fitness data
  useEffect(() => {
    if (streakData?.fitnessData) {
      console.log(
        "[PersonalDashboard] Fitness data from streakData:",
        streakData.fitnessData
      );
    }
  }, [streakData]);

  // Debug logging for userStats
  useEffect(() => {
    console.log("[PersonalDashboard] Current userStats:", userStats);
  }, [userStats]);

  // Update streak when component mounts - only for Farcaster users
  useEffect(() => {
    const fid = getFid();
    if (isFarcasterUser && fid) {
      // Reset the stats calculated flag when the user changes
      statsCalculatedRef.current = false;

      // Use a ref to track if we've already updated the streak
      const streakUpdateTimeout = setTimeout(() => {
        syncFitnessData(fid);
      }, 1000); // Add a small delay to avoid immediate API calls

      return () => clearTimeout(streakUpdateTimeout);
    }
  }, [isFarcasterUser, getFid, syncFitnessData]); // Include syncFitnessData dependency

  // Helper function to calculate rankings
  const calculateRankings = useCallback(
    (stats: UserStats) => {
      if (!networkData) return;

      let allUsers: { address: string; pushups: number; squats: number }[] = [];

      // Collect all users for ranking
      for (const [network, scores] of Object.entries(networkData)) {
        const scoresArray = scores as any[];
        scoresArray.forEach((score: any) => {
          const existingUser = allUsers.find(
            (u) => u.address.toLowerCase() === score.user.toLowerCase()
          );

          if (existingUser) {
            existingUser.pushups += score.pushups;
            existingUser.squats += score.squats;
          } else {
            allUsers.push({
              address: score.user,
              pushups: score.pushups,
              squats: score.squats,
            });
          }
        });
      }

      if (allUsers.length > 0) {
        // Use appropriate address for ranking lookup
        const userAddress = isFarcasterUser
          ? (user?.custody_address || "").toLowerCase()
          : (user?.address || "").toLowerCase();

        // Sort by pushups
        const pushupsRanking = [...allUsers].sort(
          (a, b) => b.pushups - a.pushups
        );
        const userPushupsRank =
          pushupsRanking.findIndex(
            (u) => u.address.toLowerCase() === userAddress
          ) + 1;

        // Sort by squats
        const squatsRanking = [...allUsers].sort((a, b) => b.squats - a.squats);
        const userSquatsRank =
          squatsRanking.findIndex(
            (u) => u.address.toLowerCase() === userAddress
          ) + 1;

        // Sort by total (pushups + squats)
        const totalRanking = [...allUsers].sort(
          (a, b) => b.pushups + b.squats - (a.pushups + a.squats)
        );
        const userTotalRank =
          totalRanking.findIndex(
            (u) => u.address.toLowerCase() === userAddress
          ) + 1;

        stats.rank = {
          pushups: userPushupsRank || allUsers.length,
          squats: userSquatsRank || allUsers.length,
          overall: userTotalRank || allUsers.length,
        };
      }
    },
    [networkData, isFarcasterUser, user?.custody_address, user?.address]
  );

  // Define calculateStats function with useCallback and memoize expensive calculations
  const calculateStats = useCallback(async () => {
    // Only run if we have the necessary data and aren't already loading
    if (isLoading || !networkData || !isAuthenticated) return;

    // Create a new stats object
    const stats: UserStats = {
      totalPushups: 0,
      totalSquats: 0,
      networkBreakdown: {},
      predictions: {
        total: 0,
        correct: 0,
        pending: 0,
        staked: 0,
      },
      rank: {
        pushups: 0,
        squats: 0,
        overall: 0,
      },
    };

    // If we have fitness data from streakData, use it directly
    if (streakData?.fitnessData) {
      console.log(
        "[PersonalDashboard] Using fitness data from streakData:",
        streakData.fitnessData
      );
      stats.totalPushups = streakData.fitnessData.totalPushups || 0;
      stats.totalSquats = streakData.fitnessData.totalSquats || 0;

      // Initialize network breakdown
      if (streakData.fitnessData.networks) {
        streakData.fitnessData.networks.forEach((network) => {
          stats.networkBreakdown[network] = {
            pushups: 0,
            squats: 0,
          };
        });
      }

      // Calculate rankings
      calculateRankings(stats);

      setUserStats(stats);
      return;
    }

    // Calculate total contributions
    let allUsers: { address: string; pushups: number; squats: number }[] = [];

    // Get connected addresses - different logic for Farcaster vs wallet users
    let connectedAddresses: string[] = [];

    try {
      if (isFarcasterUser && user?.custody_address) {
        // Farcaster user - get custody and verified addresses
        connectedAddresses.push(user.custody_address.toLowerCase());

        // Try to get verified addresses from Neynar API
        const response = await fetch(
          `/api/farcaster/user?fid=${user.fid}&include_verifications=true`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (
            data.users &&
            data.users.length > 0 &&
            data.users[0].verifications
          ) {
            // Add verified addresses
            data.users[0].verifications.forEach((address: string) => {
              if (!connectedAddresses.includes(address.toLowerCase())) {
                connectedAddresses.push(address.toLowerCase());
              }
            });
          }
        }
      } else if (isWalletUser && user?.address) {
        // Wallet-only user - use connected wallet address only
        connectedAddresses.push(user.address.toLowerCase());
      }
    } catch (error) {
      console.error("Error fetching connected addresses:", error);
      // Fallback to current address if available
      if (user?.address) {
        connectedAddresses = [user.address.toLowerCase()];
      }
    }

    console.log("Connected addresses:", connectedAddresses);

    // Process each network sequentially to avoid too many API calls at once
    for (const [network, scores] of Object.entries(networkData) as [
      string,
      any[]
    ][]) {
      // Initialize network in breakdown if not exists
      if (!stats.networkBreakdown[network]) {
        stats.networkBreakdown[network] = {
          pushups: 0,
          squats: 0,
        };
      }

      // Check all connected addresses for scores
      for (const address of connectedAddresses) {
        const addressScore = scores.find(
          (score: any) => score.user.toLowerCase() === address
        );

        if (addressScore) {
          stats.totalPushups += addressScore.pushups;
          stats.totalSquats += addressScore.squats;
          stats.networkBreakdown[network].pushups += addressScore.pushups;
          stats.networkBreakdown[network].squats += addressScore.squats;
          console.log(
            `Found score for address ${address} in network ${network}`
          );
        }
      }

      // Collect all users for ranking
      scores.forEach((score: any) => {
        const existingUser = allUsers.find(
          (u) => u.address.toLowerCase() === score.user.toLowerCase()
        );

        if (existingUser) {
          existingUser.pushups += score.pushups;
          existingUser.squats += score.squats;
        } else {
          allUsers.push({
            address: score.user,
            pushups: score.pushups,
            squats: score.squats,
          });
        }
      });
    } // End of for loop

    // Calculate rankings
    calculateRankings(stats);

    // Prediction stats are now handled by UserPredictionStats component
    // which fetches real data from the user-votes API

    setUserStats(stats);
  }, [
    isLoading,
    networkData,
    isAuthenticated,
    isFarcasterUser,
    isWalletUser,
    user,
    streakData,
    calculateRankings,
  ]);

  // Call calculateStats when dependencies change, with debounce to prevent excessive calls
  useEffect(() => {
    // Skip if we don't have the necessary data
    if (isLoading || !networkData || !user) return;

    // Skip if we've already calculated stats and have data
    if (statsCalculatedRef.current && userStats) return;

    // Use a timeout to debounce multiple rapid changes
    const statsTimeout = setTimeout(() => {
      calculateStats();
      // Mark stats as calculated
      statsCalculatedRef.current = true;
    }, 500);

    // Clean up the timeout if dependencies change before it fires
    return () => clearTimeout(statsTimeout);
  }, [calculateStats, isLoading, networkData, user, userStats]); // Include all dependencies

  const generateShareableImage = async () => {
    if (!userStats || !user) return;

    setIsGeneratingImage(true);

    try {
      // This would typically call an API endpoint to generate the image
      // For now, we'll simulate it with a timeout
      setTimeout(() => {
        // In a real implementation, this would be the URL to the generated image
        setShareableImage(`/api/og/user-stats/${user.fid}`);
        setIsGeneratingImage(false);
      }, 1500);
    } catch (error) {
      console.error("Failed to generate shareable image:", error);
      setIsGeneratingImage(false);
    }
  };

  const shareStats = async () => {
    if (!shareableImage) {
      await generateShareableImage();
    }

    try {
      // Import the SDK dynamically to avoid SSR issues
      const { sdk } = await import("@farcaster/frame-sdk");
      const appUrl = process.env.NEXT_PUBLIC_URL || "https://imperfectform.fun";

      // Create a cast with the stats information using derived fitness values
      const totalExercises = fitnessPushups + fitnessSquats;

      // Include streak information if available
      let streakInfo = "";
      if (streakData && streakData.currentStreak > 0) {
        streakInfo = `\n🔥 ${streakData.currentStreak}-day streak`;
        if (streakData.currentStreak >= 7) {
          streakInfo += " (Achievement unlocked!)";
        }
      }

      const castText = `My fitness stats on Imperfect Form:\n\n${fitnessPushups} Push-ups\n${fitnessSquats} Squats\n${totalExercises} Total${streakInfo}\n\nStay Hard! 💪`;

      // Share to Farcaster using composeCast
      await sdk.actions.composeCast({
        text: castText,
        // The Farcaster SDK expects embeds to be an array of strings (URLs)
        embeds: [`${appUrl}/user-stats/${user?.fid}`],
      });

      // Show confetti animation
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);

      sendNotification({
        title: "Stats Shared!",
        body: "Your fitness stats have been shared to your Farcaster feed.",
      });
    } catch (error) {
      console.error("Error sharing to Farcaster:", error);

      // Check if it's a user rejection error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("rejected") ||
        errorMessage.includes("denied")
      ) {
        // User rejected the action - show a more specific message
        toast.error("Sharing cancelled by user");
      } else {
        // Other error - show a generic message
        sendNotification({
          title: "Sharing Failed",
          body: "Could not share your stats. Please try again.",
        });
      }
    }
  };

  // Derive pushups/squats from on-chain data if available, else from userStats
  const fitnessPushups = useMemo(
    () => streakData?.fitnessData?.totalPushups ?? userStats?.totalPushups ?? 0,
    [streakData?.fitnessData?.totalPushups, userStats?.totalPushups]
  );
  const fitnessSquats = useMemo(
    () => streakData?.fitnessData?.totalSquats ?? userStats?.totalSquats ?? 0,
    [streakData?.fitnessData?.totalSquats, userStats?.totalSquats]
  );

  // Show loading state if either auth, data, or streaks are loading
  if (authLoading || isLoading || streaksLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  // Handle different user authentication states
  if (!isAuthenticated) {
    return (
      <div className="game-container my-8 text-center">
        <h2 className="retro-heading text-xl mb-6">My Dashboard</h2>
        <p className="mb-4">Connect your account to view your fitness stats</p>
        <p className="text-xs text-gray-400">Beauty is imperfect</p>
      </div>
    );
  }

  // Show wallet-only user experience
  if (isWalletUser) {
    return (
      <div className="space-y-6">
        {/* Wallet Stats */}
        {userStats && (
          <div className="game-container">
            <div className="flex items-center justify-between mb-4">
              <h2 className="retro-heading text-xl">My Wallet Stats</h2>
              <div className="text-xs text-gray-400">
                {user?.address?.slice(0, 6)}...{user?.address?.slice(-4)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="text-center p-4 bg-pink-900/20 border border-pink-600 rounded">
                <div className="text-3xl font-bold text-pink-400 mb-1">
                  {formatNumber(fitnessPushups)}
                </div>
                <div className="text-sm text-gray-300">💪 Push-ups</div>
                {userStats.rank.pushups > 0 && (
                  <div className="text-xs text-gray-400 mt-1">
                    Rank #{userStats.rank.pushups}
                  </div>
                )}
              </div>
              <div className="text-center p-4 bg-green-900/20 border border-green-600 rounded">
                <div className="text-3xl font-bold text-green-400 mb-1">
                  {formatNumber(fitnessSquats)}
                </div>
                <div className="text-sm text-gray-300">🏃 Squats</div>
                {userStats.rank.squats > 0 && (
                  <div className="text-xs text-gray-400 mt-1">
                    Rank #{userStats.rank.squats}
                  </div>
                )}
              </div>
            </div>

            {/* Network Breakdown */}
            <div className="mb-6">
              <h3 className="text-lg mb-3">Network Breakdown</h3>
              <div className="space-y-2">
                {Object.entries(userStats.networkBreakdown).map(
                  ([network, stats]) => {
                    const total = stats.pushups + stats.squats;
                    if (total === 0) return null;

                    return (
                      <div
                        key={network}
                        className="flex items-center justify-between p-2 bg-gray-800 rounded"
                      >
                        <div className="flex items-center">
                          <div
                            className={`w-4 h-4 rounded-full mr-2 bg-${network}`}
                          ></div>
                          <span className="text-sm capitalize">{network}</span>
                        </div>
                        <div className="text-sm">
                          {stats.pushups}💪 + {stats.squats}🏃 = {total}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          </div>
        )}

        {/* Farcaster Upsell - Only show in web app context */}
        <WebAppOnly>
          <div className="game-container text-center">
            <div className="bg-blue-900/20 border border-blue-600 rounded p-4">
              <h3 className="text-blue-300 font-bold mb-2">
                🟣 Unlock More Features
              </h3>
              <p className="text-sm text-blue-200 mb-3">
                Connect with Farcaster for streaks, social features, and
                cross-chain identity
              </p>
              <a
                href="https://www.farcaster.xyz/"
                target="_blank"
                rel="noopener noreferrer"
                className="retro-button text-sm px-4 py-2 inline-block"
              >
                Get Farcaster →
              </a>
            </div>
          </div>
        </WebAppOnly>
      </div>
    );
  }

  // Farcaster user loading state
  if (isFarcasterUser && authLoading) {
    return (
      <div className="game-container my-8 text-center">
        <h2 className="retro-heading text-xl mb-6">My Dashboard</h2>
        <p className="mb-4">Loading your Farcaster data...</p>
        <div className="loading-spinner mx-auto"></div>
      </div>
    );
  }

  // Initialize default stats for new users
  if (!userStats) {
    // If we have fitness data from streakData, use it to initialize stats
    if (streakData?.fitnessData) {
      console.log(
        "[PersonalDashboard] Initializing userStats with fitness data:",
        streakData.fitnessData
      );

      const initialStats: UserStats = {
        totalPushups: streakData.fitnessData.totalPushups || 0,
        totalSquats: streakData.fitnessData.totalSquats || 0,
        networkBreakdown: {},
        predictions: {
          total: 0,
          correct: 0,
          pending: 0,
          staked: 0,
        },
        rank: {
          pushups: 0,
          squats: 0,
          overall: 0,
        },
      };

      // Initialize network breakdown
      if (streakData.fitnessData.networks) {
        streakData.fitnessData.networks.forEach((network) => {
          initialStats.networkBreakdown[network] = {
            pushups: 0,
            squats: 0,
          };
        });
      }

      setUserStats(initialStats);
    } else {
      // No fitness data, use empty stats
      const emptyStats: UserStats = {
        totalPushups: 0,
        totalSquats: 0,
        networkBreakdown: {
          celo: { pushups: 0, squats: 0 },
          polygon: { pushups: 0, squats: 0 },
          base: { pushups: 0, squats: 0 },
          monad: { pushups: 0, squats: 0 },
        },
        predictions: {
          total: 0,
          correct: 0,
          pending: 0,
          staked: 0,
        },
        rank: {
          pushups: 0,
          squats: 0,
          overall: 0,
        },
      };
      setUserStats(emptyStats);
    }

    return (
      <div className="flex justify-center items-center p-8">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  // Check if user is new (has no recorded fitness)
  const isNewUser = fitnessPushups === 0 && fitnessSquats === 0;
  console.log("[PersonalDashboard] isNewUser check:", {
    isNewUser,
    fitnessPushups,
    fitnessSquats,
    fromStreakData: !!streakData?.fitnessData,
    userStatsTotal: userStats?.totalPushups + userStats?.totalSquats,
  });

  return (
    <div className="game-container my-8">
      {/* Confetti animation */}
      <Confetti active={showConfetti} />

      <div className="flex justify-center items-center mb-6">
        <div className="flex space-x-4">
          <button
            className={`px-4 py-2 rounded-lg text-sm ${
              !showTargetsAndStreaks ? "bg-blue-600" : "bg-gray-700"
            }`}
            onClick={() => setShowTargetsAndStreaks(false)}
          >
            Stats
          </button>
          <button
            className={`px-4 py-2 rounded-lg text-sm ${
              showTargetsAndStreaks ? "bg-blue-600" : "bg-gray-700"
            }`}
            onClick={() => setShowTargetsAndStreaks(true)}
          >
            Targets & Streaks
          </button>
        </div>
      </div>

      {!showTargetsAndStreaks ? (
        <>
          {/* User Profile with Welcome Message for New Users */}
          <div className="flex items-center justify-center mb-4">
            <div className="flex flex-col items-center">
              <Image
                src={user?.pfp_url || "/placeholder-avatar.png"}
                alt="Profile"
                className="w-16 h-16 rounded-full border-4 border-white mb-2"
                width={64}
                height={64}
              />
              <h3 className="text-lg">{user?.display_name}</h3>
              <p className="text-sm text-gray-400">@{user?.username}</p>
              {isNewUser && (
                <div className="mt-1 text-xs pulse-animation">
                  <span className="text-pink-500">GM</span> •{" "}
                </div>
              )}
            </div>
          </div>

          {/* Compact Streak Display */}
          <div className="flex items-center justify-between p-3 border-2 border-blue-500 rounded-lg mb-4 bg-blue-900 bg-opacity-10">
            <div className="flex items-center">
              {streakData && streakData.currentStreak > 0 ? (
                <>
                  <FaFire className="text-red-500 mr-2" size={20} />
                  <div>
                    <span className="font-bold">
                      {streakData.currentStreak}-day streak
                    </span>
                    {streakData.currentStreak >= 7 && (
                      <span className="ml-2 text-yellow-400 text-xs">
                        <FaMedal className="inline-block mr-1" />
                        Achievement!
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm">
                  Fitness data:{" "}
                  {streakData?.fitnessData ? "Available" : "Not found"}
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              {streakData && (
                <span className="text-xs text-gray-400">
                  Best:{" "}
                  <span className="text-yellow-400">
                    {streakData.longestStreak}d
                  </span>
                </span>
              )}
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                onClick={() => {
                  // Reset the stats calculated flag to force recalculation
                  statsCalculatedRef.current = false;
                  const fid = getFid();
                  if (fid) {
                    syncFitnessData(fid);
                    toast.success("Syncing fitness data...");
                  } else {
                    toast.error("No user FID available");
                  }
                }}
              >
                Update
              </button>
              <button
                className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                onClick={() => {
                  // Force a complete refresh
                  statsCalculatedRef.current = false;
                  setUserStats(null);
                  const fid = getFid();
                  if (fid) {
                    syncFitnessData(fid);
                    toast.success("Force refreshing data...");
                  } else {
                    toast.error("No user FID available for refresh");
                  }
                }}
              >
                Force Refresh
              </button>
            </div>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Fitness Stats */}
            <div className="border-2 border-white p-4 rounded-lg">
              <h3 className="text-center mb-4">Fitness Stats</h3>

              {isNewUser ? (
                <div className="text-center mb-4">
                  <div className="flex justify-between mb-4">
                    <div className="text-center flex-1">
                      <div className="text-pink-500 text-xl sm:text-2xl mb-1">
                        0
                      </div>
                      <div className="text-xs">Push-ups</div>
                    </div>
                    <div className="text-center flex-1">
                      <div className="text-green-500 text-xl sm:text-2xl mb-1">
                        0
                      </div>
                      <div className="text-xs">Squats</div>
                    </div>
                    <div className="text-center flex-1">
                      <div className="text-yellow-500 text-xl sm:text-2xl mb-1">
                        0
                      </div>
                      <div className="text-xs">Total</div>
                    </div>
                  </div>
                  <div className="text-xs mb-4 border-t border-gray-700 pt-4">
                    <p className="mb-2">
                      Get fit, have fun, raise dosh for good causes at{" "}
                      <span className="text-yellow-400">imperfectform.fun</span>
                    </p>
                    <p className="text-xs text-gray-400">
                      Contributions appear here automatically
                    </p>
                  </div>
                  <div className="text-xs text-gray-300 mb-2">
                    &ldquo;Chase perfection, catch greatness.&rdquo;
                  </div>
                  <div className="text-xs text-pink-500 pulse-animation">
                    Every rep counts
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between mb-4">
                    <div className="text-center flex-1">
                      <div className="text-pink-500 text-xl sm:text-2xl mb-1">
                        {formatNumber(fitnessPushups)}
                      </div>
                      <div className="text-xs">Push-ups</div>
                    </div>
                    <div className="text-center flex-1">
                      <div className="text-green-500 text-xl sm:text-2xl mb-1">
                        {formatNumber(fitnessSquats)}
                      </div>
                      <div className="text-xs">Squats</div>
                    </div>
                    <div className="text-center flex-1">
                      <div className="text-yellow-500 text-xl sm:text-2xl mb-1">
                        {formatNumber(fitnessPushups + fitnessSquats)}
                      </div>
                      <div className="text-xs">Total</div>
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-xs mb-1">Your Rank</div>
                    <div className="flex justify-center space-x-2 sm:space-x-4">
                      <div className="text-center">
                        <div className="text-pink-500">
                          {userStats.rank.pushups || "-"}
                        </div>
                        <div className="text-xs">Push-ups</div>
                      </div>
                      <div className="text-center">
                        <div className="text-green-500">
                          {userStats.rank.squats || "-"}
                        </div>
                        <div className="text-xs">Squats</div>
                      </div>
                      <div className="text-center">
                        <div className="text-yellow-500">
                          {userStats.rank.overall || "-"}
                        </div>
                        <div className="text-xs">Overall</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Prediction Stats */}
            <div className="border-2 border-white p-4 rounded-lg">
              <h3 className="text-center mb-4">Prediction Stats</h3>
              <UserPredictionStats isNewUser={isNewUser} />
            </div>
          </div>
        </>
      ) : (
        <TargetsAndStreaks networkData={networkData} isLoading={isLoading} />
      )}

      {/* Compact Share Stats or Call to Action */}
      <div className="text-center">
        {isNewUser ? (
          <div className="mb-4">
            <div className="border border-gray-700 p-3 rounded-lg mb-3 text-xs">
              <p className="mb-1">
                15% of all predictions go to{" "}
                <a
                  href="https://explorer.gitcoin.co/#/round/42220/31/57"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-400 underline"
                >
                  Greenpill Kenya
                </a>
              </p>
              <button
                className="text-celo text-xs underline"
                onClick={() =>
                  window.open("https://warpcast.com/greenpillnetwork", "_blank")
                }
              >
                Follow @greenpillnetwork 🌱
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-center mb-4">
            <button
              className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg text-sm flex items-center"
              onClick={shareStats}
              disabled={isGeneratingImage}
            >
              <FaShare className="mr-2" />
              {isGeneratingImage ? "Generating..." : "Share Stats"}
            </button>

            <div className="flex space-x-2">
              <button
                onClick={() => {
                  const predictionsTab = document.querySelector(
                    'button[class*="retro-button"][class*="scale-105"]'
                  );
                  if (predictionsTab) {
                    (predictionsTab as HTMLButtonElement).click();
                  }
                }}
                className="text-xs flex items-center text-blue-400 border border-gray-700 rounded px-2 py-1"
              >
                Predictions <FaArrowRight className="ml-1" size={10} />
              </button>

              <button
                onClick={() => {
                  const leaderboardTab = document.querySelector(
                    'button[class*="retro-button"]:nth-child(2)'
                  );
                  if (leaderboardTab) {
                    (leaderboardTab as HTMLButtonElement).click();
                  }
                }}
                className="text-xs flex items-center text-blue-400 border border-gray-700 rounded px-2 py-1"
              >
                Leaderboard <FaArrowRight className="ml-1" size={10} />
              </button>
            </div>
          </div>
        )}

        {shareableImage && (
          <div className="mb-4 border border-gray-700 p-2 rounded-lg">
            <Image
              src={shareableImage}
              alt="Shareable Stats"
              width={250}
              height={131}
              className="mx-auto"
            />
          </div>
        )}
      </div>

      {/* Compact Motivational Footer */}
      <div className="text-center mt-3 border-t border-gray-800 pt-2">
        <p className="text-xs text-yellow-400 glow-text">
          GN • <span className="text-gray-400">imperfect form</span>
        </p>
      </div>
    </div>
  );
}
