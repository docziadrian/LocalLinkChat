import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Users, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User, Connection } from "@shared/schema";

interface CreateGroupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  connections: (Connection & { otherUser: User })[];
  onGroupCreated?: () => void;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function CreateGroupDialog({ isOpen, onClose, connections, onGroupCreated }: CreateGroupDialogProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  
  const createGroupMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/groups", {
        name: groupName.trim(),
        description: groupDescription.trim() || null,
        memberIds: selectedMembers,
      });
    },
    onSuccess: () => {
      toast({ title: t("groups.groupCreated") });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      resetForm();
      onClose();
      onGroupCreated?.();
    },
    onError: () => {
      toast({ title: t("errors.general"), variant: "destructive" });
    },
  });
  
  const resetForm = () => {
    setGroupName("");
    setGroupDescription("");
    setSelectedMembers([]);
  };
  
  const toggleMember = (userId: string) => {
    setSelectedMembers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };
  
  const handleCreate = () => {
    if (groupName.trim()) {
      createGroupMutation.mutate();
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        resetForm();
        onClose();
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            {t("groups.createGroup")}
          </DialogTitle>
          <DialogDescription>
            {t("groups.createGroupDescription")}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("groups.groupName")}</label>
            <Input
              placeholder={t("groups.groupNamePlaceholder")}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={50}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("groups.groupDescription")}</label>
            <Textarea
              placeholder={t("groups.groupDescriptionPlaceholder")}
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              maxLength={200}
              rows={2}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("groups.selectMembers")}</label>
            <p className="text-xs text-muted-foreground">{t("groups.selectMembersDescription")}</p>
            
            {connections.length === 0 ? (
              <div className="text-center py-4 text-sm text-muted-foreground">
                {t("groups.noConnectionsForGroup")}
              </div>
            ) : (
              <ScrollArea className="h-48 border rounded-md">
                <div className="p-2 space-y-1">
                  {connections.map((connection) => (
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
                          {getInitials(connection.otherUser.fullName || connection.otherUser.name || "")}
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
            )}
            
            {selectedMembers.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedMembers.length} {t("groups.members", { count: selectedMembers.length })}
              </p>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!groupName.trim() || createGroupMutation.isPending}
          >
            {createGroupMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              t("groups.createAndInvite")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

