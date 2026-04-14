import { Context } from 'telegraf';
import { IUser } from '../models/User';

export interface BotContext extends Context {
  dbUser: IUser;
}
