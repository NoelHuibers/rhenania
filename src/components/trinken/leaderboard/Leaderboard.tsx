"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
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
export interface Consumer {
  id: number;
  name: string;
  avatar: string;
  amount: number; // Liter
  change: string; // z. B. "+12%"
}

interface LeaderboardProps {
  consumers: Consumer[];
}

function getRankIcon(rank: number) {
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
}

export default function Leaderboard({ consumers }: LeaderboardProps) {
  const [showAll, setShowAll] = useState(false);
  const topConsumers = consumers.slice(0, 5);
  const remainingConsumers = consumers.slice(5);

  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>🏆</span>
          Top-Performer
        </CardTitle>
        <CardDescription>Alkoholkonsum der letzten 6 Monate</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
                <p className="font-semibold text-gray-900">{consumer.name}</p>
                <p className="text-sm text-gray-600">
                  {consumer.amount}L getrunken
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              {consumer.change}
            </Badge>
          </div>
        ))}

        <Button
          variant="outline"
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-4"
        >
          {showAll ? (
            <>
              <ChevronUp className="h-4 w-4 mr-2" />
              Weniger anzeigen
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-2" />
              Alle anzeigen ({remainingConsumers.length} weitere)
            </>
          )}
        </Button>

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
                    <p className="font-medium text-gray-900">{consumer.name}</p>
                    <p className="text-sm text-gray-600">{consumer.amount}L</p>
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
  );
}
