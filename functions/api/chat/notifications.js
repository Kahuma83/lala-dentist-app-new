import {
  handleChatError,
  removeDoctorChatPushSubscription,
  saveDoctorChatPushSubscription
} from "../../_shared/doctor-chat.js";

export const onRequestPost = async (context) => {
  try {
    return await saveDoctorChatPushSubscription(context);
  } catch (error) {
    return handleChatError(error);
  }
};

export const onRequestDelete = async (context) => {
  try {
    return await removeDoctorChatPushSubscription(context);
  } catch (error) {
    return handleChatError(error);
  }
};
