const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const { protect } = require('../middleware/auth');

// CLOUDINARY CONFIGURATION

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'daplink_feed',
        resource_type: 'auto',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'mp4', 'mov', 'webm']
    },
});

const upload = multer({ storage: storage });

/**
 * GET ALL POSTS
 */
router.get('/', protect, async (req, res, next) => {
    try {
        const currentUserId = req.user._id.toString();
        const posts = await Post.find()
            .populate('author', 'handle username name avatar profile profilePicture profession')
            .sort({ createdAt: -1 })
            .limit(50);

        const formattedPosts = posts.map((post) => ({
            id: post._id,
            name: post.author?.name || post.author?.username || post.author?.handle || 'Unknown User',
            authorId: post.author?._id?.toString(),
            handle: `@${post.author?.handle || post.author?.username || 'unknown'}`,
            role: post.author?.profession || 'User',
            avatar: post.author?.avatar || post.author?.profilePicture || post.author?.profile || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.handle || post.author?.username || 'unknown'}`,
            content: post.content,
            mediaUrl: post.mediaUrl,
            mediaType: post.mediaType,
            time: post.createdAt,
            likes: post.likes.length,
            comments: post.commentCount,
            shares: post.shares,
            tags: post.tags,
            xpReward: post.xpReward,
            verified: true,
            liked: post.likes.some(id => id.toString() === currentUserId),
        }));

        res.json({ success: true, posts: formattedPosts });
    } catch (error) {
        next(error);
    }
});

/**
 * CREATE A POST
 */
router.post('/', protect, upload.single('media'), async (req, res, next) => {
    try {
        const { content, tags, authorId } = req.body;

        if ((!content || !content.trim()) && !req.file) {
            return res.status(400).json({ success: false, message: 'Post must contain either text or media' });
        }

        let parsedTags = [];
        if (tags) {
            try { parsedTags = JSON.parse(tags); } catch (e) { parsedTags = [tags]; }
        }
        const resolvedAuthorId = authorId || req.user.daplinkID || req.user._id;

        const newPost = await Post.create({
            author: resolvedAuthorId,
            content: content ? content.trim() : '',
            tags: parsedTags,
            mediaUrl: req.file ? req.file.path : null,
            mediaType: req.file ? (req.file.mimetype.startsWith('video') ? 'video' : 'image') : null,
            xpReward: '+10 XP',
        });

        await newPost.populate('author', 'handle username name avatar profile profilePicture profession');
        res.status(201).json({ success: true, post: newPost });
    } catch (error) {
        next(error);
    }
});

/**
 * TOGGLE LIKE
 */
router.post('/:id/like', protect, async (req, res, next) => {
    try {
        const postId = req.params.id;
        const userId = req.user._id;
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        const hasLiked = post.likes.some(id => id.toString() === userId.toString());
        if (hasLiked) post.likes.pull(userId);
        else post.likes.addToSet(userId);

        await post.save();
        res.json({ success: true, liked: !hasLiked, likesCount: post.likes.length });
    } catch (error) {
        next(error);
    }
});

/**
 * GET COMMENTS
 */
router.get('/:id/comments', protect, async (req, res, next) => {
    try {
        const comments = await Comment.find({ post: req.params.id })
            .populate('author', 'handle username name avatar profile profilePicture profession')
            .sort({ createdAt: -1 });
        res.json({ success: true, comments });
    } catch (error) {
        next(error);
    }
});

/**
 * CREATE A COMMENT
 */
router.post('/:id/comments', protect, async (req, res, next) => {
    try {
        const { content, authorId } = req.body;
        if (!content || !content.trim()) return res.status(400).json({ success: false, message: 'Empty comment' });

        const resolvedAuthorId = authorId || req.user.daplinkID || req.user._id;

        const newComment = await Comment.create({
            post: req.params.id,
            author: resolvedAuthorId,
            content: content.trim()
        });

        await Post.findByIdAndUpdate(req.params.id, { $inc: { commentCount: 1 } });
        await newComment.populate('author', 'handle username name avatar profile profilePicture profession');
        res.status(201).json({ success: true, comment: newComment });
    } catch (error) {
        next(error);
    }
});

/**
 * EDIT A POST
 */
router.put('/:id', protect, async (req, res, next) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        const authorStr = post.author.toString();
        const userStr = req.user._id.toString();
        const daplinkStr = req.user.daplinkID?.toString();

        if (authorStr !== userStr && authorStr !== daplinkStr) {
            return res.status(403).json({ success: false, message: 'Not authorized to edit this post' });
        }

        post.content = req.body.content.trim();
        await post.save();

        res.json({ success: true, post });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE A POST
 */
router.delete('/:id', protect, async (req, res, next) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        const authorStr = post.author.toString();
        const userStr = req.user._id.toString();
        const daplinkStr = req.user.daplinkID?.toString();

        if (authorStr !== userStr && authorStr !== daplinkStr) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this post' });
        }

        if (post.mediaUrl) {
            const urlParts = post.mediaUrl.split('/');
            const filename = urlParts[urlParts.length - 1];
            const publicId = `daplink_feed/${filename.split('.')[0]}`;

            const resourceType = post.mediaType === 'video' ? 'video' : 'image';
            await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
        }

        await post.deleteOne();
        await Comment.deleteMany({ post: req.params.id });

        res.json({ success: true, message: 'Post deleted' });
    } catch (error) {
        next(error);
    }
});

/**
 * REPOST
 */
router.post('/:id/repost', protect, async (req, res, next) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
        post.shares += 1;
        await post.save();

        res.json({ success: true, shares: post.shares });
    } catch (error) {
        next(error);
    }
});

module.exports = router;