import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { UserRoundIcon } from "lucide-react";
import { useMockProfile, updateMockProfile } from "../hooks/useMockProfile";
import { SettingsPageContainer } from "../components/settings/settingsLayout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

export const Route = createFileRoute("/_chat/settings/profile")({ component: ProfileSettings });

function ProfileSettings() {
  const profile = useMockProfile();
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio);
  const [saved, setSaved] = useState(false);
  return (
    <SettingsPageContainer>
      <div className="flex max-w-lg flex-col gap-8">
        <div>
          <h2 className="text-lg font-medium">个人资料</h2>
          <p className="mt-2 text-sm text-muted-foreground">让你的工作空间更有个人风格。</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserRoundIcon className="size-7" />
          </div>
          <div>
            <p className="font-medium">{profile.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">本地预览账号</p>
          </div>
        </div>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            updateMockProfile({ name, bio });
            setName(name.trim() || "用户");
            setSaved(true);
          }}
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="profile-name" className="text-sm font-medium">
              用户名字
            </label>
            <Input
              id="profile-name"
              value={name}
              maxLength={24}
              onValueChange={(value) => {
                setName(value);
                setSaved(false);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="profile-bio" className="text-sm font-medium">
              个人简介
            </label>
            <Input
              id="profile-bio"
              value={bio}
              maxLength={100}
              onValueChange={(value) => {
                setBio(value);
                setSaved(false);
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">当前为模拟资料，修改仅在本次预览中生效。</p>
          <div className="flex items-center gap-3">
            <Button type="submit">保存资料</Button>
            <span role="status" className="text-xs text-muted-foreground">
              {saved ? "已保存" : ""}
            </span>
          </div>
        </form>
      </div>
    </SettingsPageContainer>
  );
}
