const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
    {
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        content: {
            type: String,
            required: false,
            trim: true,
            maxlength: 1000,
        },
        mediaUrl: {
            type: String,
            default: null
        },
        mediaType: {
            type: String,
            enum: ['image', 'video', null],
            default: null
        },
    tags: [
            {
                type: String,
                trim: true,
            },
        ],
        likes: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        commentCount: {
            type: Number,
            default: 0,
        },
        shares: {
            type: Number,
            default: 0,
        },
        xpReward: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

// Index for fetching the latest posts quickly
postSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);