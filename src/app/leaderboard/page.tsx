"use client";

import {
  ChevronDown,
  ChevronUp,
  Droplets,
  TrendingUp,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";

// Mock data for consumers
const allConsumers = [
  {
    id: 1,
    name: "Alex Johnson",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 847,
    change: "+12%",
  },
  {
    id: 2,
    name: "Sarah Chen",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 782,
    change: "+8%",
  },
  {
    id: 3,
    name: "Mike Rodriguez",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 756,
    change: "+15%",
  },
  {
    id: 4,
    name: "Emma Wilson",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 698,
    change: "+5%",
  },
  {
    id: 5,
    name: "David Kim",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 645,
    change: "+18%",
  },
  {
    id: 6,
    name: "Lisa Thompson",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 612,
    change: "+3%",
  },
  {
    id: 7,
    name: "James Brown",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 589,
    change: "+7%",
  },
  {
    id: 8,
    name: "Anna Garcia",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 567,
    change: "+11%",
  },
  {
    id: 9,
    name: "Tom Anderson",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 534,
    change: "+9%",
  },
  {
    id: 10,
    name: "Rachel Lee",
    avatar: "/placeholder.svg?height=40&width=40",
    amount: 498,
    change: "+6%",
  },
];

// Mock data for 6-month consumption chart
const monthlyData = [
  { month: "Jul", consumption: 12450 },
  { month: "Aug", consumption: 13200 },
  { month: "Sep", consumption: 11800 },
  { month: "Oct", consumption: 14100 },
  { month: "Nov", consumption: 15300 },
  { month: "Dec", consumption: 16750 },
];

export default function Literboard() {
  const [showAll, setShowAll] = useState(false);
  const topConsumers = allConsumers.slice(0, 5);
  const remainingConsumers = allConsumers.slice(5);

  const totalConsumption = allConsumers.reduce(
    (sum, consumer) => sum + consumer.amount,
    0
  );
  const growthRate = 12.5; // Mock growth rate percentage

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return "🥇";
      case 2:
        return "🥈";
      case 3:
        return "🥉";
      default:
        return `#${rank}`;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-gray-900 flex items-center justify-center gap-3">
            <Droplets className="h-10 w-10 text-blue-600" />
            Literboard
          </h1>
          <p className="text-gray-600">
            Track and celebrate hydration champions
          </p>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Consumption
              </CardTitle>
              <Droplets className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalConsumption.toLocaleString()}L
              </div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Growth Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                +{growthRate}%
              </div>
              <p className="text-xs text-muted-foreground">vs last month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Active Consumers
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{allConsumers.length}</div>
              <p className="text-xs text-muted-foreground">
                Total participants
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Leaderboard */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>🏆</span>
                Top Performers
              </CardTitle>
              <CardDescription>
                Leading hydration champions this month
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Top 5 */}
              {topConsumers.map((consumer, index) => (
                <div
                  key={consumer.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl font-bold w-12 text-center">
                      {getRankIcon(index + 1)}
                    </div>
                    <Avatar className="h-10 w-10">
                      <AvatarImage
                        src={consumer.avatar || "/placeholder.svg"}
                        alt={consumer.name}
                      />
                      <AvatarFallback>
                        {consumer.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {consumer.name}
                      </p>
                      <p className="text-sm text-gray-600">
                        {consumer.amount}L consumed
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="bg-green-100 text-green-800"
                  >
                    {consumer.change}
                  </Badge>
                </div>
              ))}

              {/* Expand/Collapse Button */}
              <Button
                variant="outline"
                onClick={() => setShowAll(!showAll)}
                className="w-full mt-4"
              >
                {showAll ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-2" />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-2" />
                    Show All ({remainingConsumers.length} more)
                  </>
                )}
              </Button>

              {/* Remaining consumers */}
              {showAll && (
                <div className="space-y-3 mt-4 pt-4 border-t">
                  {remainingConsumers.map((consumer, index) => (
                    <div
                      key={consumer.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-lg font-semibold w-12 text-center text-gray-600">
                          #{index + 6}
                        </div>
                        <Avatar className="h-8 w-8">
                          <AvatarImage
                            src={consumer.avatar || "/placeholder.svg"}
                            alt={consumer.name}
                          />
                          <AvatarFallback className="text-xs">
                            {consumer.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-gray-900">
                            {consumer.name}
                          </p>
                          <p className="text-sm text-gray-600">
                            {consumer.amount}L
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-green-600">
                        {consumer.change}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Consumption Chart */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>6-Month Consumption Trend</CardTitle>
              <CardDescription>
                Total consumption over the last 6 months
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  consumption: {
                    label: "Consumption (L)",
                    color: "hsl(var(--chart-1))",
                  },
                }}
                className="h-[300px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData}>
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      className="text-xs"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      className="text-xs"
                      tickFormatter={(value) => `${value / 1000}K`}
                    />
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      formatter={(value) => [`${value}L`, "Consumption"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="consumption"
                      stroke="var(--color-consumption)"
                      strokeWidth={3}
                      dot={{
                        fill: "var(--color-consumption)",
                        strokeWidth: 2,
                        r: 4,
                      }}
                      activeDot={{
                        r: 6,
                        stroke: "var(--color-consumption)",
                        strokeWidth: 2,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
              <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span>Trending up by {growthRate}% this month</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
