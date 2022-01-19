import { Post } from "./post";
import { ClientConfiguration, ClientCredentials } from "./types";
import { Network } from "./network";
import { RawUser, User } from "./user";
import fetch from "cross-fetch";
import { Group, RawGroup } from "./group";

/**
 * Represents a Photop client
 * Provides an interface of interactions that can be done by the user.
 */
export class Client {
	chatDelay: number | undefined;

	get user() {
		return this._network.user;
	}
	get userid() {
		return this._network.userid;
	}

	private _network: Network;

	get groups(){
		return this._network.groups;
	}

	/**
	 * @deprecated
	 * Retrieves a post from cache
	 */
	getPostFromCache(id: string): Post | undefined {
		return this._network.posts[id];
	}

	/**
	 * Gets a post. If it does not exist in cache, attempts to get it by using timestamp of the objectid.
	 */
	async getPost(id: string): Promise<Post | undefined> {
		if (this._network.posts[id]) return this._network.posts[id];

		await this._network.getPosts(
			10,
			parseInt(id.substring(0, 8), 16) * 1000 - 5000
		); //offset by 5 seconds in case the time is actually BEFORE it was posted
		return this._network.posts[id];
	}

	/**
	 * The short group id that is used for invitations.
	 * @returns Group; errors if already in group.
	 */
	async joinGroup(groupinviteid: string){
		const id = (await this._network.message<{GroupID: string}>("InviteUpdate", {Task: "Join", GroupID: groupinviteid})).Body.GroupID;
		
		if (this._network.groups[id]?.members[this.userid!]) /* return;*/ throw new Error("already in group");

		const rawGroup = (await this._network.message<{Group: RawGroup}>("GetGroups", {GroupID: id})).Body.Group;
		this._network.groups[rawGroup._id] = new Group(this._network, rawGroup);
		this._network.onGroupsChanged();
		return this._network.groups[rawGroup._id];
	}
	
	async getUser(id: string): Promise<User | undefined> {
		if (this._network.users[id]) return this._network.users[id];

		const data = (await fetch(
			"https://photoprest.herokuapp.com/Users?UserId=" + id
		)
			.then((e) => e.json())
			.catch(() => {
				console.log("fetch to photoprest resulted in error");
			})) as { user?: RawUser };

		if (data.user) {
			return new User(this._network, data.user);
		}
	}

	async getUserFromUsername(name: string): Promise<User | undefined> {
		for (const userid in this._network.users) {
			if (this._network.users[userid].username===name) {
				return this._network.users[userid];
			}
		}
		const response = await this._network.message<{Result: RawUser[]}>("Search", {Type:"Users", Search: name});
		this._network.processUsers(response.Body.Result);

		for (const userid in this._network.users) {
			if (this._network.users[userid].username===name) {
				return this._network.users[userid];
			}
		}
	}

	/**
	 * Handle posts here
	 * @example
	 * client.onPost((post)=>{
	 * 	post.chat("Hello");
	 * })
	 */
	onPost = (post: Post) => {};

	onReady = () => {};

	/**
	 * Create a post with text. Images do not seem to work at the present.
	 */
	async post(text: string, medias: any[] = [], configuration: [] = []) {
		return this._network.post(text, undefined, medias, configuration);
	}

	/**
	 * Can switch user by passing a username and password. May not work.
	 */
	async authenticate(username: string, password: string) {
		this._network.authenticate(username, password);
	}

	/**
	 * Sign out.
	 */
	async signout() {
		this._network.signout();
	}

	/**
	 * Create a client with one of two types of credentials.
	 * {username, password} or {userid, authtoken} or none at all (this will mean you are signed out)
	 */
	constructor(
		credentials?: ClientCredentials,
		configuration?: ClientConfiguration
	) {
		this._network = new Network(credentials, configuration);
		this._network.onPost = (post) => {
			this.onPost(post);
		};
		this._network.onReady = () => {
			this.onReady();
		};
	}
}
