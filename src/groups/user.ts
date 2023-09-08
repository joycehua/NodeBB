import db from '../database';
import user from '../user';

interface Ownership {
    isOwner(uid: number, groupName: string): Promise<boolean>;
    isOwners(uids: number[], groupName: string): Promise<boolean[]>;
    grant(toUid: number, groupName: string): Promise<void>;
    rescind(toUid: number, groupName: string): Promise<void>;
}

interface UserData {
    uid: number;
    username: string;
    displayname: string;
    userslug: string;
    fullname: string;
    email: string;
    'icon:text': string;
    'icon:bgColor': string;
    groupTitle: string;
    groupTitleArray: string[];
    status: string;
    reputation: number;
    'email:confirmed': number;
}

interface Group {
    name?: string;
    description?: string;
    hidden?: number;
    system?: number;
    userTitle?: string;
    userTitleEscaped?: string;
    icon?: string;
    labelColor?: string;
    createtime?: number;
    slug?: string;
    memberCount?: number;
    private?: number;
    userTitleEnabled?: number;
    disableJoinRequests?: number;
    disableLeave?: number;
    nameEncoded?: string;
    displayName?: string;
    textColor?: string;
    createtimeISO?: string;
    cover?: {
      thumb: {
        url: string;
      };
      url: string;
      position: string;
    };
    memberPostCids?: string;
    memberPostCidsArray?: number[];
    members?: Member[];
    truncated?: boolean;
}
interface Member {
    uid: number;
    username: string;
    picture: string | null;
    userslug: string;
    icon: {
      text: string;
      bgColor: string;
    };
  }

interface Groups {
    ownership?: Ownership;
    isAdmin?: boolean;
    isGlobalMod?: boolean;
    ephemeralGroups: 'guests' | 'spiders';
    getUsersFromSet(set: string, fields: string[]): Promise<UserData[]>;
    getUserGroups(uids: number[]): Promise<boolean[][]>;
    getUserGroupsFromSet(set: string, uids: number[]): Promise<boolean[][]>;
    getUserGroupMembership(set: string, uids: number[]): Promise<string[][]>;
    getUserInviteGroups(uid: number): Promise<Group[]>;
    getNonPrivilegeGroups(set: string, start: number, stop: number): Promise<Group[]>;
    isMemberOfGroups(uid: number, groupNames: string[]): Promise<boolean[]>;
    getGroupsData(memberOf: string[]): Promise<boolean[]>
}

export = function (Groups: Groups) {
    Groups.getUsersFromSet = async function (set: string, fields: string[]) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const uids: number[] = await db.getSetMembers(set) as number[];

        if (fields) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            return await user.getUsersFields(uids, fields) as UserData[];
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        return await user.getUsersData(uids) as UserData[];
    };

    Groups.getUserGroups = async function (uids: number[]) {
        return await Groups.getUserGroupsFromSet('groups:visible:createtime', uids);
    };

    Groups.getUserGroupsFromSet = async function (set: string, uids: number[]) {
        const memberOf: string[][] = await Groups.getUserGroupMembership(set, uids);
        return await Promise.all(memberOf.map(memberOf => Groups.getGroupsData(memberOf)));
    };

    async function findUserGroups(uid: number, groupNames: string[]) {
        const isMembers: boolean[] = await Groups.isMemberOfGroups(uid, groupNames);
        return groupNames.filter((name, i) => isMembers[i]);
    }

    Groups.getUserGroupMembership = async function (set: string, uids: number[]) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const groupNames: string[] = await db.getSortedSetRevRange(set, 0, -1) as string[];
        return await Promise.all(uids.map(uid => findUserGroups(uid, groupNames)));
    };

    Groups.getUserInviteGroups = async function (uid: number) {
        let allGroups = await Groups.getNonPrivilegeGroups('groups:createtime', 0, -1);
        allGroups = allGroups.filter(group => !Groups.ephemeralGroups.includes(group.name));

        const publicGroups = allGroups.filter(group => group.hidden === 0 && group.system === 0 && group.private === 0);
        const adminModGroups = [
            { name: 'administrators', displayName: 'administrators' },
            { name: 'Global Moderators', displayName: 'Global Moderators' },
        ];
        // Private (but not hidden)
        const privateGroups = allGroups.filter(group => group.hidden === 0 &&
            group.system === 0 && group.private === 1);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const [ownership, isAdmin, isGlobalMod] = await Promise.all([
            Promise.all(privateGroups.map(group => Groups.ownership.isOwner(uid, group.name))),
            user.isAdministrator(uid),
            user.isGlobalModerator(uid),
        ]) as [boolean[], boolean, boolean];
        const ownGroups = privateGroups.filter((group, index) => ownership[index]);
        let inviteGroups: Group[] = [];
        if (isAdmin) {
            inviteGroups = inviteGroups.concat(adminModGroups).concat(privateGroups);
        } else if (isGlobalMod) {
            inviteGroups = inviteGroups.concat(privateGroups);
        } else {
            inviteGroups = inviteGroups.concat(ownGroups);
        }
        return inviteGroups
            .concat(publicGroups);
    };
};
