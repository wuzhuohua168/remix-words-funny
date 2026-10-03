import { orpc } from "../common/orpc";

// loaders
import { getAllBooks } from "./loader/getAllBooks";
import { getBookDetail } from "./loader/getBookDetail";
import { getDoneWordsOfBook } from "./loader/getDoneWordsOfBook";
import { getFavoriteWords } from "./loader/getFavoriteWords";
import { getIsPostVote } from "./loader/getIsPostVote";
import { getIsWordDone } from "./loader/getIsWordDone";
import { getIsWordFavorite } from "./loader/getIsWordFavorite";
import { getMyUserInfo } from "./loader/getMyUserInfo";
import { getMyPlan } from "./loader/getMyPlan";
import { getPostVote } from "./loader/getPostVote";
import { getStarBooks } from "./loader/getStarBooks";
import { getStudyCalendar } from "./loader/getStudyCalendar";
import { getStudyQueue } from "./loader/getStudyQueue";
import { getUnDoneWordsOfBook } from "./loader/getUnDoneWordsOfBook";
import { getWordCognates } from "./loader/getWordCognates";
import { getWordComments } from "./loader/getWordComments";
import { getWordDetail } from "./loader/getWordDetail";
import { getWordGraph } from "./loader/getWordGraph";
import { getWordPhrases } from "./loader/getWordPhrases";
import { getWordSentences } from "./loader/getWordSentences";
import { getWordsOfBook } from "./loader/getWordsOfBook";
import { getWordsOfKeyword } from "./loader/getWordsOfKeyword";
import { getWordSynonyms } from "./loader/getWordSynonyms";
import { getWordTranslations } from "./loader/getWordTranslations";

// actions
import { doneWord } from "./action/doneWord";
import { favoriteWord } from "./action/favoriteWord";
import { sendComment } from "./action/sendComment";
import { sendVerifyCode } from "./action/sendVerifyCode";
import { signIn } from "./action/signIn";
import { signOut } from "./action/signOut";
import { reviewWord } from "./action/reviewWord";
import { savePlan } from "./action/savePlan";
import { signUp } from "./action/signUp";
import { starBook } from "./action/starBook";
import { unDoneWord } from "./action/unDoneWord";
import { unfavoriteWord } from "./action/unfavoriteWord";
import { unStarBook } from "./action/unStarBook";
import { unVotePost } from "./action/unVotePost";
import { updatePassword } from "./action/updatePassword";
import { votePost } from "./action/votePost";

const loader = orpc.router({
  getMyUserInfo,
  getAllBooks,
  getBookDetail,
  getWordDetail,
  getWordGraph,
  getWordsOfKeyword,
  getWordCognates,
  getWordPhrases,
  getWordSentences,
  getWordSynonyms,
  getWordTranslations,
  getWordsOfBook,
  getIsWordDone,
  getIsWordFavorite,
  getFavoriteWords,
  getStarBooks,
  getDoneWordsOfBook,
  getUnDoneWordsOfBook,
  getStudyCalendar,
  getStudyQueue,
  getMyPlan,
  getWordComments,
  getPostVote,
  getIsPostVote,
});

const action = orpc.router({
  doneWord,
  unDoneWord,
  favoriteWord,
  unfavoriteWord,
  sendVerifyCode,
  signIn,
  signOut,
  signUp,
  updatePassword,
  starBook,
  unStarBook,
  reviewWord,
  savePlan,
  sendComment,
  votePost,
  unVotePost,
});

export const router = orpc.router({ loader, action });
