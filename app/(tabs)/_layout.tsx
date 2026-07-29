import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

/**
 * Bottom tab navigation.
 *
 * The three screens are peers rather than a hierarchy — a learner moves
 * between lessons, puzzles and a real game freely — so tabs fit better
 * than links pushed to the bottom of each screen, and they leave the
 * vertical space to the board.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2E7D62',
        tabBarInactiveTintColor: '#8A7A66',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E4DACB',
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Play',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tutorial"
        options={{
          title: 'Learn',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="puzzles"
        options={{
          title: 'Puzzles',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="extension-puzzle-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
