import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserPlus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User, Connection, GroupMember } from "@shared/schema";

interface AddGroupMembersDialogProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  connections: (Connection & { otherUser: User })[];
  onMembersAdded?: () => void;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AddGroupMembersDialog({
  isOpen,
  onClose,
  groupId,
  groupName,
  connections,
  onMembersAdded,
}: AddGroupMembersDialogProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  // Fetch current group members to exclude them from the list
  const { data: groupDetails } = useQuery<{
    id: string;
    name: string;
    members: (GroupMember & { user: User })[];
  }>({
    queryKey: ["/api/groups", groupId],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch group");
      return res.json();
    },
    enabled: isOpen && !!groupId,
  });

  // Filter connections to exclude existing members
  const existingMemberIds = new Set(
    groupDetails?.members?.map((m) => m.userId) || []
  );
  const availableConnections = connections.filter(
    (c) => !existingMemberIds.has(c.otherUser.id)
  );

  // Reset selection when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedMembers([]);
    }
  }, [isOpen]);

  const inviteMembersMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/groups/${groupId}/invite`, {
        userIds: selectedMembers,
      });
    },
    onSuccess: (data: { invited: string[] }) => {
      const count = data.invited?.length || selectedMembers.length;
      toast({
        title: t("groups.invitationSent"),
        description: t("groups.membersInvited", { count }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      setSelectedMembers([]);
      onClose();
      onMembersAdded?.();
    },
    onError: () => {
      toast({ title: t("errors.general"), variant: "destructive" });
    },
  });

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleInvite = () => {
    if (selectedMembers.length > 0) {
      inviteMembersMutation.mutate();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setSelectedMembers([]);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            {t("groups.addMembers")}
          </DialogTitle>
          <DialogDescription>
            {t("groups.addMembersDescription", { name: groupName })}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {availableConnections.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              {t("groups.noMoreConnectionsToAdd")}
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-3">
                {t("groups.selectMembersToInvite")}
              </p>
              <ScrollArea className="h-64 border rounded-md">
                <div className="p-2 space-y-1">
                  {availableConnections.map((connection) => (
                    <label
                      key={connection.id}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedMembers.includes(connection.otherUser.id)}
                        onCheckedChange={() => toggleMember(connection.otherUser.id)}
                      />
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={connection.otherUser.avatarUrl || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {getInitials(
                            connection.otherUser.fullName ||
                              connection.otherUser.name ||
                              ""
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {connection.otherUser.fullName || connection.otherUser.name}
                        </p>
                        {connection.otherUser.jobPosition && (
                          <p className="text-xs text-muted-foreground truncate">
                            {connection.otherUser.jobPosition}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </ScrollArea>

              {selectedMembers.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {selectedMembers.length}{" "}
                  {selectedMembers.length === 1
                    ? t("groups.memberSelected")
                    : t("groups.membersSelected")}
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleInvite}
            disabled={selectedMembers.length === 0 || inviteMembersMutation.isPending}
          >
            {inviteMembersMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                {t("groups.inviteMembers")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



